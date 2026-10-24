import { appendMessageContent, filterMessageText, IChatMessage } from '@xpert-ai/contracts'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DataSource, Entity, PrimaryColumn } from 'typeorm'
import { createClient } from 'redis'
import { lastValueFrom, Subject, toArray } from 'rxjs'
import { RedisSseStreamService, SseMessageEvent } from '../redis-sse.service'
import { RunDisplaySnapshotEntity } from './display-snapshot.entity'
import { RunDisplaySnapshotStore } from './display-snapshot.store'

@Entity('chat_conversation_thread')
class ChatConversationThread {
    @PrimaryColumn({ type: 'varchar', length: 100 })
    threadId: string
}
@Entity('xpert_agent_execution')
class XpertAgentExecution {
    @PrimaryColumn({ type: 'uuid' })
    id: string
}

const databaseUrl = process.env.XPERT_DISPLAY_TEST_DATABASE_URL
const redisUrl = process.env.XPERT_DISPLAY_TEST_REDIS_URL
const integration = databaseUrl && redisUrl ? describe : describe.skip
const scope = { tenantId: randomUUID(), organizationId: randomUUID() }
const owner = randomUUID()
const frozen = { activeMessageId: 'ai', messages: [{ id: 'ai', role: 'ai' as const, content: '', executionId: 'run' }] }

integration('display recovery / real PostgreSQL and Redis', () => {
    const schema = `display_${randomUUID().replace(/-/g, '')}`
    const redis = createClient({ url: redisUrl })
    let database: DataSource
    let store: RunDisplaySnapshotStore
    let service: RedisSseStreamService
    let threadId: string, runId: string
    beforeAll(async () => {
        if (!new URL(databaseUrl!).pathname.endsWith('_test')) throw new Error('Use a disposable _test database')
        if (new URL(redisUrl!).port !== '64486') throw new Error('Use the dedicated disposable Redis on port 64486')
        database = new DataSource({
            type: 'postgres',
            url: databaseUrl,
            extra: { options: `-c search_path=${schema}` }
        })
        await database.initialize()
        await database.query(`CREATE SCHEMA "${schema}"`)
        await database.query(
            `CREATE TABLE chat_conversation_thread ("threadId" varchar(100) PRIMARY KEY, "tenantId" uuid, "organizationId" uuid, metadata jsonb, status varchar DEFAULT 'busy', "runtimeContinuationBlockedAt" timestamptz)`
        )
        await database.query(
            "CREATE TABLE xpert_agent_execution (id uuid PRIMARY KEY, status varchar DEFAULT 'running')"
        )
        await database.query(readFileSync(join(__dirname, 'migrations/20261022-run-display-snapshot.sql'), 'utf8'))
        await redis.connect()
        store = new RunDisplaySnapshotStore(database)
        service = new RedisSseStreamService(redis as never, store)
        process.env.AI_SSE_STREAM_MAXLEN = '10'
        process.env.AI_SSE_READ_BLOCK_MS = '20'
    })
    afterAll(async () => {
        delete process.env.AI_SSE_STREAM_MAXLEN
        delete process.env.AI_SSE_READ_BLOCK_MS
        if (redis.isOpen) await redis.quit()
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA "${schema}" CASCADE`)
            await database.destroy()
        }
    })
    beforeEach(async () => {
        jest.restoreAllMocks()
        await redis.flushDb()
        threadId = randomUUID()
        runId = randomUUID()
        await database.query('INSERT INTO xpert_agent_execution (id) VALUES ($1)', [runId])
        await database.query(
            `INSERT INTO chat_conversation_thread ("threadId", "tenantId", "organizationId", metadata) VALUES ($1,$2,$3,$4::jsonb)`,
            [
                threadId,
                scope.tenantId,
                scope.organizationId,
                JSON.stringify({
                    chatkitRunLease: {
                        owner,
                        executionId: runId,
                        expiresAt: new Date(Date.now() + 90000).toISOString()
                    }
                })
            ]
        )
    })
    it('registers compatible projection columns and cascading foreign keys in TypeORM metadata', async () => {
        const metadataSource = new DataSource({
            type: 'postgres',
            url: databaseUrl,
            entities: [RunDisplaySnapshotEntity, ChatConversationThread, XpertAgentExecution]
        })
        await metadataSource.initialize()
        try {
            const metadata = metadataSource.getMetadata(RunDisplaySnapshotEntity)
            expect(metadata.primaryColumns.map((column) => column.propertyName)).toEqual(['threadId', 'runId'])
            expect(metadata.foreignKeys.map((key) => key.onDelete)).toEqual(['CASCADE', 'CASCADE'])
            expect(metadata.findColumnWithPropertyName('snapshot')?.type).toBe('jsonb')
        } finally {
            await metadataSource.destroy()
        }
    })
    it('restores a running tool after trimming, then follows live completion without executing it again', async () => {
        const source = new Subject<MessageEvent>()
        const message: IChatMessage = { id: 'ai', role: 'ai', content: '', status: 'thinking', executionId: runId }
        const shared = service.wrapChatStream(source, {
            target: { transport: 'redis-stream', threadId, runId, snapshotOwner: owner, snapshotScope: scope }
        })
        const producer = lastValueFrom(shared.pipe(toArray()))
        const emit = (data: unknown) => source.next({ data } as MessageEvent)
        emit({ type: 'event', event: 'on_message_start', data: message })
        const cursor = await waitFor(async () => (await store.read(scope, threadId, runId))?.cursor)
        let calls = 0
        const runTool = () => {
            calls++
            const component = {
                type: 'component' as const,
                id: 'tool-1',
                data: {
                    category: 'Tool',
                    tool: 'sandbox_shell',
                    title: '收集运行结果',
                    input: { command: 'sleep 30 && echo done' },
                    status: 'running'
                }
            }
            appendMessageContent(message, component)
            emit({ type: 'message', data: component })
        }
        runTool()
        for (let n = 0; n < 220; n++)
            emit({ type: 'event', event: 'on_agent_start', data: { id: 'agent', status: 'running' } })
        await waitFor(async () => (await store.read(scope, threadId, runId))?.revision === 222)
        const first = await redis.xRange(service.getStreamKey(threadId, runId), '-', '+', { COUNT: 1 })
        expect(first[0].id).not.toBe(cursor)
        const connection = await service.createSseStream({
            threadId,
            runId,
            mode: 'join',
            lastEventId: cursor,
            requireReplayStart: true,
            snapshotScope: scope,
            isRunFinished: async () => false
        })
        const received: SseMessageEvent[] = []
        const done = lastValueFrom(connection.stream.pipe(toArray()))
        // A second observer is deliberately avoided: one subscription is one connection.
        const snapshot = await waitFor(async () => {
            const value = await store.read(scope, threadId, runId)
            return value?.revision === 222 ? value : undefined
        })
        await new Promise((resolve) => setTimeout(resolve, 60))
        const completed = {
            type: 'component' as const,
            id: 'tool-1',
            data: { category: 'Tool', tool: 'sandbox_shell', status: 'success' }
        }
        appendMessageContent(message, completed)
        emit({ type: 'message', data: completed })
        appendMessageContent(message, 'done')
        emit({ type: 'message', data: 'done' })
        emit({ type: 'event', event: 'on_agent_end', data: { id: 'agent', status: 'success' } })
        emit({
            type: 'event',
            event: 'on_message_end',
            data: { id: 'ai', role: 'ai', executionId: runId, status: 'success' }
        })
        source.complete()
        await producer
        received.push(...(await done))
        expect(received[0].data).toMatchObject({
            type: 'stream_snapshot',
            snapshot: { cursor: snapshot.cursor },
            continuous: true
        })
        expect(JSON.stringify(received[0].data)).toContain('sandbox_shell')
        expect(JSON.stringify(received[0].data)).toContain('running')
        expect(JSON.stringify(received.slice(1))).toContain('success')
        expect(JSON.stringify(received.slice(1))).toContain('done')
        expect(calls).toBe(1)
        console.log(
            JSON.stringify({
                beforeSavedMessage: { status: 'thinking', content: '' },
                toolCalls: calls,
                recovered: received
            })
        )
    })
    it('pairs the frozen state with its own acknowledgement even while the producer advances', async () => {
        let unblock!: () => void
        const blocked = new Promise<void>((resolve) => {
            unblock = resolve
        })
        const original = store.save.bind(store)
        const saves = jest.spyOn(store, 'save').mockImplementation(async (...args) => {
            await blocked
            return original(...args)
        })
        const source = new Subject<MessageEvent>()
        const message: IChatMessage = { id: 'ai', role: 'ai', executionId: runId, content: 'before' }
        const done = lastValueFrom(
            service
                .wrapChatStream(source, {
                    target: { transport: 'redis-stream', threadId, runId, snapshotOwner: owner, snapshotScope: scope }
                })
                .pipe(toArray())
        )
        source.next({ data: { type: 'event', event: 'on_message_start', data: message } } as MessageEvent)
        await waitFor(async () => saves.mock.calls.length > 0)
        message.content = 'after'
        source.next({ data: { type: 'message', data: ' after' } } as MessageEvent)
        source.complete()
        expect(saves.mock.calls[0][3].messages[0].content).toBe('before')
        const entry = await redis.xRange(
            service.getStreamKey(threadId, runId),
            saves.mock.calls[0][2],
            saves.mock.calls[0][2]
        )
        expect(JSON.parse(entry[0].message.data).data.content).toBe('before')
        unblock()
        await done
        expect(filterMessageText((await store.read(scope, threadId, runId))!.messages[0].content)).toBe('before after')
    })
    it('recovers snapshot persistence during a quiet tool without requiring another tool execution or event', async () => {
        const begin = store.begin.bind(store)
        jest.spyOn(store, 'begin')
            .mockRejectedValueOnce(new Error('temporary database outage'))
            .mockImplementation(begin)
        const source = new Subject<MessageEvent>()
        const done = lastValueFrom(
            service
                .wrapChatStream(source, {
                    target: { transport: 'redis-stream', threadId, runId, snapshotOwner: owner, snapshotScope: scope }
                })
                .pipe(toArray())
        )
        source.next({
            data: {
                type: 'event',
                event: 'on_message_start',
                data: { id: 'ai', role: 'ai', executionId: runId, content: '' }
            }
        } as MessageEvent)
        source.next({
            data: {
                type: 'message',
                data: { type: 'component', id: 'tool', data: { category: 'Tool', status: 'running' } }
            }
        } as MessageEvent)
        const snapshot = await waitFor(async () => store.read(scope, threadId, runId))
        expect(snapshot.revision).toBe(2)
        expect(JSON.stringify(snapshot.messages)).toContain('running')
        const anchor = await redis.xRange(service.getStreamKey(threadId, runId), snapshot.cursor, snapshot.cursor)
        expect(JSON.parse(anchor[0].message.data).data.id).toBe('tool')
        source.complete()
        await done
    })
    it('retains uncovered events after failed saves and final flush, then replays the complete tail', async () => {
        const save = store.save.bind(store)
        jest.spyOn(store, 'save').mockImplementation(async (...args) => {
            if (args[1] > 1) throw new Error('injected database outage')
            return save(...args)
        })
        const source = new Subject<MessageEvent>()
        const message: IChatMessage = { id: 'ai', role: 'ai', executionId: runId, content: '' }
        const producer = lastValueFrom(
            service
                .wrapChatStream(source, {
                    target: { transport: 'redis-stream', threadId, runId, snapshotOwner: owner, snapshotScope: scope }
                })
                .pipe(toArray())
        )
        source.next({ data: { type: 'event', event: 'on_message_start', data: message } } as MessageEvent)
        const first = await waitFor(async () => (await store.read(scope, threadId, runId))?.cursor)
        for (let n = 0; n < 20; n++) {
            message.content += 'x'
            source.next({ data: { type: 'message', data: 'x' } } as MessageEvent)
        }
        source.complete()
        await producer
        expect(await redis.xLen(service.getStreamKey(threadId, runId))).toBe(23)
        expect((await store.read(scope, threadId, runId))?.cursor).toBe(first)
        const connection = await service.createSseStream({
            threadId,
            runId,
            mode: 'join',
            lastEventId: first,
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(connection.stream.pipe(toArray()))
        expect(events).toHaveLength(21)
        expect(events.filter((event) => JSON.stringify(event.data).includes('stream_resync'))).toHaveLength(0)
    })
    it('bounds a failed snapshot tail and explicitly marks a gap instead of applying partial output', async () => {
        const writer = (await store.begin(scope, threadId, runId, owner))!
        const first = await service.appendEvent(threadId, runId, { type: 'stream_start' }, true)
        await store.save(writer, 1, first!, { ...frozen, messages: [{ ...frozen.messages[0], executionId: runId }] })
        for (let n = 0; n < 220; n++)
            await service.appendEvent(threadId, runId, { type: 'message', data: 'unsafe tail' }, true)
        expect(await redis.xLen(service.getStreamKey(threadId, runId))).toBeLessThan(140)
        const connection = await service.createSseStream({
            threadId,
            runId,
            mode: 'join',
            lastEventId: first!,
            requireReplayStart: true,
            snapshotScope: scope
        })
        const events = await lastValueFrom(connection.stream.pipe(toArray()))
        expect(events[0].data).toMatchObject({ type: 'stream_snapshot', continuous: false })
        expect(JSON.stringify(events)).not.toContain('unsafe tail')
    })
    it('rejects stale revisions, old segments, foreign scopes and expired owners', async () => {
        const display = { ...frozen, messages: [{ ...frozen.messages[0], executionId: runId }] }
        const first = (await store.begin(scope, threadId, runId, owner))!
        expect(first).not.toBeNull()
        expect(await store.save(first, 2, '20-0', display)).not.toBeNull()
        expect(await store.save(first, 1, '10-0', display)).toBeNull()
        expect(await store.save(first, 3, '10-0', display)).toBeNull()
        const next = (await store.begin(scope, threadId, runId, owner))!
        expect(await store.save(first, 3, '30-0', display)).toBeNull()
        expect(await store.save(next, 1, '40-0', display)).not.toBeNull()
        expect(await store.read({ ...scope, organizationId: randomUUID() }, threadId, runId)).toBeNull()
        expect(await store.begin(scope, threadId, runId, 'other-owner')).toBeNull()
        await database.query(
            `UPDATE chat_conversation_thread SET metadata = jsonb_set(metadata, '{chatkitRunLease,expiresAt}', '"2000-01-01T00:00:00.000Z"') WHERE "threadId" = $1`,
            [threadId]
        )
        expect(await store.save(next, 2, '50-0', display)).toBeNull()
        await database.query(
            `UPDATE chat_conversation_thread SET metadata = '{}'::jsonb, status = 'error' WHERE "threadId" = $1`,
            [threadId]
        )
        await database.query(`UPDATE xpert_agent_execution SET status = 'interrupted' WHERE id = $1`, [runId])
        expect(await store.save(next, 3, '60-0', display)).toBeNull()
        // A terminal-looking row cannot grant ownership to a delayed producer.
        await database.query(`UPDATE chat_conversation_thread SET status = 'idle' WHERE "threadId" = $1`, [threadId])
        expect(await store.save(next, 4, '70-0', display)).toBeNull()
        expect((await store.read(scope, threadId, runId))?.cursor).toBe('40-0')
    })
})

async function waitFor<T>(read: () => Promise<T>): Promise<NonNullable<T>> {
    const end = Date.now() + 10000
    while (Date.now() < end) {
        const value = await read()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Condition did not become true')
}
