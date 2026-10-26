import { DataSource } from 'typeorm'
import { GetXpertWorkflowQuery } from '../../xpert/queries/get-xpert-workflow.query'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { instanceToPlain } from 'class-transformer'
import { threadControlViewSchema } from '@xpert-ai/contracts'
import { ExecutionTaskControl } from '@xpert-ai/server-core'
import { viewFixture } from './testing/view.test-fixture'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ThreadDTO } from '../../ai/dto/thread.dto'
import { CopilotCheckpoint } from '../../copilot-checkpoint/copilot-checkpoint.entity'
import { ThreadControlProjection } from './thread-control-projection.entity'
import { threadGraphRevision } from '../thread-graph-revision'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
integration('public controls with actual durable execution / PostgreSQL', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>
    beforeEach(async () => {
        f = await viewFixture(url)
    })
    afterEach(async () => {
        await f.close()
    })

    it('keeps accepted termination visible across refresh/replicas until the actual tool exits', async () => {
        let calls = 0,
            release!: () => void
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        await f.execution.admit(f.executionId, 'tool')
        const tool = (async () => {
            calls++
            await gate
            await f.execution.settle(f.executionId, 'tool')
        })()
        const running = (await f.views.read(f.threadId)).controlView
        await f.control.cancel(f.threadId, [f.executionId])
        await f.control.finish(f.threadId, f.executionId, 'interrupted')
        for (const reader of [f.views, f.makeView(), f.makeView()]) {
            const { controlView } = await reader.read(f.threadId)
            expect(controlView).toMatchObject({
                state: 'stopping',
                actions: { canSend: false, canRetry: false, canResume: false, canTerminate: false }
            })
            expect(BigInt(controlView.revision)).toBeGreaterThan(BigInt(running.revision))
            threadControlViewSchema.parse(controlView)
        }
        expect(calls).toBe(1)
        release()
        await tool
        await f.control.finish(f.threadId, f.executionId, 'interrupted')
        const ended = (await f.views.read(f.threadId)).controlView
        expect(ended).toMatchObject({ state: 'stopped', actions: { canSend: true, canResume: false, canRetry: false } })
        await expect(f.control.start(f.threadId, f.executionId)).rejects.toThrow()
        expect(calls).toBe(1)
        console.info('After repair: stopping until actual exit; toolCalls=1; ended=', ended.state)
    })

    it('does not borrow a second connection for policy while holding the projection transaction', async () => {
        if (f.db.options.type !== 'postgres') throw new Error('PostgreSQL fixture required')
        const single = await new DataSource({
            ...f.db.options,
            extra: { options: `-c search_path=${f.db.options.schema}`, max: 1, connectionTimeoutMillis: 1000 }
        }).initialize()
        const execute = jest.mocked(f.bus.execute).getMockImplementation()
        if (!execute) throw new Error('Fixture policy query required')
        jest.spyOn(f.bus, 'execute').mockImplementation(async (query: object) => {
            if (query instanceof GetXpertWorkflowQuery) await single.query('SELECT 1')
            return execute(query, undefined)
        })
        try {
            expect((await f.makeView(single).read(f.threadId)).controlView).toMatchObject({
                state: 'running',
                actions: { canQueue: true }
            })
            await f.pause()
            expect((await f.makeView(single).read(f.threadId)).controlView.actions.canResume).toBe(true)
        } finally {
            await single.destroy()
        }
    })

    it('publishes a first view under concurrent cold replica reads', async () => {
        const reads = await Promise.allSettled(Array.from({ length: 8 }, () => f.makeView().read(f.threadId)))
        expect(reads.every((read) => read.status === 'fulfilled')).toBe(true)
        expect(
            new Set(reads.flatMap((read) => (read.status === 'fulfilled' ? [read.value.controlView.revision] : [])))
        ).toEqual(new Set(['1']))
    })

    it('orders evidence and replacement runs, retains the clock across service recreation, and serializes readers', async () => {
        const first = (await f.views.read(f.threadId)).controlView
        const reads = await Promise.all(Array.from({ length: 8 }, () => f.makeView().read(f.threadId)))
        expect(new Set(reads.map((read) => read.controlView.revision))).toEqual(new Set([first.revision]))
        await f.pause()
        const paused = (await f.views.read(f.threadId)).controlView
        expect(paused.state).toBe('paused')
        expect(BigInt(paused.revision)).toBeGreaterThan(BigInt(first.revision))
        expect((await f.makeView().read(f.threadId)).controlView.revision).toBe(paused.revision)
        await f.control.cancel(f.threadId, [f.executionId])
        await f.control.finish(f.threadId, f.executionId, 'interrupted')
        const newId = randomUUID()
        await f.control.start(f.threadId, newId)
        const newer = (await f.views.read(f.threadId)).controlView
        expect(newer.runId).toBe(newId)
        expect(BigInt(newer.revision)).toBeGreaterThan(BigInt(paused.revision))
    })

    it('pauses safely, validates graph/checkpoint, and admits only one concurrent resume', async () => {
        await f.execution.admit(f.executionId, 'already-done')
        await f.execution.settle(f.executionId, 'already-done')
        const { result } = await f.pause()
        expect((await f.views.read(f.threadId)).controlView.actions.canResume).toBe(true)
        const resumes = await Promise.allSettled([
            f.control.claimResume(f.threadId, f.executionId, result.pauseId, threadGraphRevision(f.graph)),
            f.control.claimResume(f.threadId, f.executionId, result.pauseId, threadGraphRevision(f.graph))
        ])
        expect(resumes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect((await f.views.read(f.threadId)).controlView.actions.canResume).toBe(false)
        await expect(f.execution.admit(f.executionId, 'already-done')).rejects.toThrow()
    })

    it('rejects unsafe resume when the workflow changes', async () => {
        await f.pause()
        f.graph.nodes.push({
            key: 'agent',
            type: 'agent',
            position: { x: 0, y: 0 },
            entity: { key: 'agent', prompt: 'changed' }
        })
        expect((await f.views.read(f.threadId)).controlView.actions.canResume).toBe(false)
    })

    it('preserves existing retry availability for a completed idle thread', async () => {
        await f.control.finish(f.threadId, f.executionId, 'idle')
        expect((await f.views.read(f.threadId)).controlView).toMatchObject({
            state: 'completed',
            actions: { canSend: true, canRetry: true }
        })
    })

    it('withholds resume when its saved checkpoint has disappeared', async () => {
        await f.pause()
        await f.db.manager.clear(CopilotCheckpoint)
        expect((await f.views.read(f.threadId)).controlView).toMatchObject({
            state: 'paused',
            actions: { canResume: false, canSend: false }
        })
    })

    it('keeps existing client input completable while pausing but disables it after termination', async () => {
        await f.execution.admit(f.executionId, 'client-input')
        await f.control.requestPause(f.threadId, f.executionId)
        expect((await f.views.read(f.threadId)).controlView).toMatchObject({
            state: 'pausing',
            actions: { canRespond: true, canSend: false }
        })
        await f.control.cancel(f.threadId, [f.executionId])
        expect((await f.views.read(f.threadId)).controlView.actions.canRespond).toBe(false)
    })

    it('keeps necessary input available under parent pause without opening a new run', async () => {
        await f.control.stageInput(f.threadId, f.executionId, ['input'])
        await f.control.finish(f.threadId, f.executionId, 'interrupted', null, { tasks: [] })
        await f.control.requestPause(f.threadId, f.executionId)
        const input = (await f.views.read(f.threadId)).controlView
        expect(input).toMatchObject({
            state: 'input_required',
            actions: { canRespond: true, canSend: false, canResume: false }
        })
        await f.control.cancel(f.threadId, [f.executionId])
        expect((await f.views.read(f.threadId)).controlView.actions.canRespond).toBe(false)
    })

    it('waits for attached work, while independent/shared work neither stops nor blocks settlement', async () => {
        const parent = await f.tasks.execution(f.executionId)
        const children = await Promise.all(
            (['attached', 'detached', 'shared'] as const).map((policy) =>
                f.tasks.register({
                    ...f.tenant,
                    kind: 'mcp-operation',
                    resourceId: randomUUID(),
                    parent: { version: 2, targetId: parent.id },
                    policy
                })
            )
        )
        for (const child of children) await f.tasks.claim(child.id)
        await f.control.finish(f.threadId, f.executionId, 'idle')
        expect((await f.views.read(f.threadId)).controlView.state).toBe('settling')
        await f.control.cancel(f.threadId, [f.executionId])
        expect(await f.tasks.desired(children[0].id)).toBe('terminated')
        for (const child of children.slice(1)) expect(await f.tasks.desired(child.id)).toBe('running')
        await f.tasks.receipt(children[0].id, 'completed')
        await f.control.finish(f.threadId, f.executionId, 'interrupted')
        expect((await f.views.read(f.threadId)).controlView).toMatchObject({
            state: 'stopped',
            actions: { canSend: true }
        })
        for (const child of children.slice(1)) expect((await f.tasks.read(child.id)).state).toBe('running')
    })

    it('masks capabilities for read-only access without caching another actor grants', async () => {
        const permitted = (await f.views.read(f.threadId)).controlView
        f.permissions.contribute = false
        const reader = (await f.views.read(f.threadId)).controlView
        expect(Object.values(reader.actions).every((value) => value === false)).toBe(true)
        expect(reader.revision).toBe(permitted.revision)
        f.permissions.read = false
        await expect(f.views.read(f.threadId)).rejects.toThrow()
    })

    it('never serializes internal checkpoints, nodes, pending results or control claims', async () => {
        const thread = await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })
        thread.runControl = {
            ...thread.runControl,
            inputNodes: ['private-node'],
            checkpoint: { threadId: f.threadId, checkpointNs: '', checkpointId: 'private' },
            pendingFinish: { status: 'idle', error: 'secret' },
            resumeClaimId: 'private'
        }
        const json = JSON.stringify(instanceToPlain(new ThreadDTO(f.conversation, undefined, thread)))
        expect(json).not.toMatch(/checkpoint|inputNodes|pendingFinish|resumeClaim|private-node|secret/)
        expect(JSON.parse(json).runControl).toEqual({ executionId: f.executionId, state: 'running' })
    })

    it('does not treat a missing ledger as a confirmed idle execution', async () => {
        await f.db.manager.clear(ExecutionTaskControl)
        expect((await f.views.read(f.threadId)).controlView).toMatchObject({
            state: 'confirming',
            actions: { canSend: false, canResume: false }
        })
    })

    it('applies the projection migration repeatedly without resetting the revision', async () => {
        const before = (await f.views.read(f.threadId)).controlView.revision
        const sql = readFileSync(join(__dirname, 'migration.sql'), 'utf8')
        await f.db.query(sql)
        await f.db.query(sql)
        expect((await f.db.manager.findOneByOrFail(ThreadControlProjection, { threadId: f.threadId })).revision).toBe(
            before
        )
    })
})
