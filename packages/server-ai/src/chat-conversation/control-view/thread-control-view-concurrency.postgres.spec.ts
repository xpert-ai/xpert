import { DataSource } from 'typeorm'
import { firstValueFrom } from 'rxjs'
import type { ThreadActivitySnapshot } from '@xpert-ai/contracts'
import { ExecutionTaskControl, TaskControlStore } from '@xpert-ai/server-core'
import { threadActivityStream } from '../../ai/thread-activity/thread-activity-stream'
import { ExecutionControlStore } from '../../execution-control/execution-control.store'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ThreadRunControlService } from '../thread-run-control.service'
import { viewFixture } from './testing/view.test-fixture'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('control view snapshots during concurrent execution updates / PostgreSQL', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>

    beforeEach(async () => {
        f = await viewFixture(url)
    })

    afterEach(async () => {
        await f.close()
    })

    async function replica() {
        if (f.db.options.type !== 'postgres') throw new Error('PostgreSQL fixture required')
        return new DataSource({
            ...f.db.options,
            extra: {
                options: `-c search_path=${f.db.options.schema} -c lock_timeout=250ms -c statement_timeout=3000ms`
            }
        }).initialize()
    }

    it.each(['thread', 'task root'] as const)(
        'serves independent and activity reads while a writer holds the %s',
        async (target) => {
            const running = (await f.views.read(f.threadId)).controlView
            const reader = await replica()
            const writer = f.db.createQueryRunner()
            await writer.connect()
            await writer.startTransaction()
            try {
                if (target === 'thread') {
                    await writer.manager.update(ChatConversationThread, { threadId: f.threadId }, { metadata: {} })
                } else {
                    const task = await f.tasks.execution(f.executionId)
                    await writer.manager.update(ExecutionTaskControl, task.rootId, { nextCheckAt: new Date() })
                }
                const activity = async (): Promise<ThreadActivitySnapshot> => ({
                    version: 1,
                    threadId: f.threadId,
                    cards: [],
                    runs: [],
                    controlView: (await f.makeView(reader).read(f.threadId)).controlView
                })
                const reads = await Promise.allSettled([
                    f
                        .makeView(reader)
                        .read(f.threadId)
                        .then(({ controlView }) => controlView),
                    firstValueFrom(threadActivityStream(activity)).then((event) => event.data.controlView)
                ])
                // Both reads must finish before the writer releases its row, with no SSE recovery changes.
                expect(reads).toEqual([
                    { status: 'fulfilled', value: running },
                    { status: 'fulfilled', value: running }
                ])
                await writer.commitTransaction()
                expect((await f.views.read(f.threadId)).controlView).toEqual(running)
            } finally {
                if (writer.isTransactionActive) await writer.rollbackTransaction()
                await writer.release()
                await reader.destroy()
            }
        }
    )

    it.each([
        { table: 'chat_conversation_thread', changed: false },
        { table: 'chat_thread_control_projection', changed: true }
    ])('keeps snapshot and revision ordered when a writer commits after reading $table', async ({ table, changed }) => {
        const running = (await f.views.read(f.threadId)).controlView
        if (changed) await f.control.requestPause(f.threadId, f.executionId)
        const reader = await replica()
        const control = new ThreadRunControlService(
            reader.getRepository(ChatConversationThread),
            reader,
            new ExecutionControlStore(reader, new TaskControlStore(reader))
        )
        const gate = pauseAfterRead(reader, table)
        const pending = f.makeView(reader).read(f.threadId)
        try {
            await Promise.race([
                gate.reached,
                pending.then(() => {
                    throw new Error('The read completed before reaching its snapshot barrier')
                })
            ])
            await control.cancel(f.threadId, [f.executionId])
            const stopping = (await f.views.read(f.threadId)).controlView
            expect(stopping.state).toBe('stopping')
            expect(BigInt(stopping.revision)).toBeGreaterThan(BigInt(running.revision))
            gate.release()
            // An unchanged old snapshot keeps its old clock; a stale publisher must retry the entire snapshot.
            expect((await pending).controlView).toEqual(changed ? stopping : running)
            expect((await f.views.read(f.threadId)).controlView).toEqual(stopping)
        } finally {
            gate.release()
            await Promise.allSettled([pending])
            control.onModuleDestroy()
            await reader.destroy()
        }
    })
})

// Delay a real SQL result at the database boundary to make the competing commits deterministic.
function pauseAfterRead(database: DataSource, table: string) {
    const runner = database.createQueryRunner()
    const query = runner.query.bind(runner)
    let signal!: () => void
    let resume!: () => void
    const reached = new Promise<void>((resolve) => (signal = resolve))
    const released = new Promise<void>((resolve) => (resume = resolve))
    let paused = false
    jest.spyOn(runner, 'query').mockImplementation(async (sql: string, parameters?: unknown[], structured?: true) => {
        const result = structured ? await query(sql, parameters, true) : await query(sql, parameters)
        if (!paused && runner.isTransactionActive && sql.startsWith('SELECT') && sql.includes(`"${table}"`)) {
            paused = true
            signal()
            await released
        }
        return result
    })
    const factory = jest.spyOn(database, 'createQueryRunner').mockReturnValueOnce(runner)
    return {
        reached,
        release: () => {
            resume()
            factory.mockRestore()
        }
    }
}
