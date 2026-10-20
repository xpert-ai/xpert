import { RequestContext } from '@xpert-ai/plugin-sdk'
import { RunStreamArchiveService, streamProducerKey } from './run-stream-archive.service'
import { RunStreamArchive, RunStreamArchivedEvent } from './run-stream-archive.entity'
import { lastValueFrom, toArray } from 'rxjs'
import { RunStreamSnapshot } from './run-stream-snapshot.entity'
import { Column, DataSource, Entity, PrimaryColumn } from 'typeorm'
import { createClient } from 'redis'
import { RunStreamSnapshotService } from './run-stream-snapshot.service'
import { RedisSseStreamService } from './redis-sse.service'
import type { RunStreamSnapshotPayload } from './run-stream-snapshot.schema'

@Entity('tenant')
class Tenant {
    @PrimaryColumn({ type: 'uuid' }) id: string
}
@Entity('organization')
class Organization {
    @PrimaryColumn({ type: 'uuid' }) id: string
}
@Entity('user')
class User {
    @PrimaryColumn({ type: 'uuid' }) id: string
}
@Entity('xpert_agent_execution')
class XpertAgentExecution {
    @PrimaryColumn({ type: 'uuid' }) id: string
    @Column({ type: 'uuid', nullable: true }) tenantId?: string
    @Column({ type: 'varchar', nullable: true }) threadId?: string
    @Column({ type: 'varchar', nullable: true }) status?: string
    @Column({ type: 'varchar', nullable: true }) error?: string
}

// Opt-in: use a disposable database and Redis, never application tables or keys.
const integration = process.env.RUN_STREAM_TEST_PG && process.env.RUN_STREAM_TEST_REDIS ? describe : describe.skip
integration('PostgreSQL snapshot commit and Redis retention', () => {
    const schemaName = `snapshot_regression_${Date.now()}`
    const tenantId = '00000000-0000-4000-8000-000000000001'
    const runId = '00000000-0000-4000-8000-000000000002'
    let database: DataSource
    let redis: ReturnType<typeof createClient>
    let snapshots: RunStreamSnapshotService
    const scope = { tenantId, threadId: 'thread', runId, epoch: '1-0', cursor: '9000-0' }
    const payload: RunStreamSnapshotPayload = {
        version: 1,
        finished: false,
        activeMessageId: 'message',
        messages: [
            {
                id: 'message',
                conversationId: 'conversation',
                executionId: runId,
                role: 'ai',
                content: '完整正文',
                status: 'thinking'
            }
        ]
    }

    beforeAll(async () => {
        database = await new DataSource({
            type: 'postgres',
            url: process.env.RUN_STREAM_TEST_PG,
            schema: schemaName,
            synchronize: false,
            extra: { options: `-c search_path=${schemaName},public` },
            entities: [
                RunStreamArchive,
                RunStreamArchivedEvent,
                RunStreamSnapshot,
                Tenant,
                Organization,
                User,
                XpertAgentExecution
            ]
        }).initialize()
        await database.query(`CREATE SCHEMA ${schemaName}`)
        await database.synchronize()
        await database.query('INSERT INTO tenant VALUES ($1)', [tenantId])
        await database.query('INSERT INTO xpert_agent_execution (id) VALUES ($1)', [runId])
        await database.query(`CREATE TABLE chat_message (id varchar PRIMARY KEY, "tenantId" uuid, "conversationId" varchar,
            "executionId" varchar, content json, reasoning json, "references" json, events json, status varchar, "updatedAt" timestamptz)`)
        await database.query(
            `INSERT INTO chat_message (id, "tenantId", "conversationId", "executionId", content, status)
            VALUES ('message', $1, 'conversation', $2, '""', 'thinking')`,
            [tenantId, runId]
        )
        redis = createClient({ url: process.env.RUN_STREAM_TEST_REDIS })
        await redis.connect()
        snapshots = new RunStreamSnapshotService(database)
    })
    afterAll(async () => {
        await redis?.quit()
        if (database?.isInitialized) {
            await database.query(`DROP SCHEMA ${schemaName} CASCADE`)
            await database.destroy()
        }
    })

    it('commits complete progress and cursor together; fences older epochs and terminal writes', async () => {
        expect(await snapshots.save(scope, payload)).toBe(true)
        expect((await snapshots.load(tenantId, 'thread', runId))?.messages[0].content).toBe('完整正文')
        expect((await database.query('SELECT content FROM chat_message'))[0].content).toBe('完整正文')
        await database.query(`UPDATE chat_message SET status = 'success', content = '"最终正文"'`)
        expect(await snapshots.save({ ...scope, cursor: '9001-0' }, payload)).toBe(true)
        expect((await database.query('SELECT content FROM chat_message'))[0].content).toBe('最终正文')
        expect(await snapshots.save({ ...scope, epoch: '9002-0', cursor: '9003-0' }, payload)).toBe(true)
        expect(await snapshots.save({ ...scope, cursor: '9999-0' }, payload)).toBe(false)
        expect((await database.query('SELECT cursor FROM run_stream_snapshot'))[0].cursor).toBe('9003-0')
        expect(
            await snapshots.save({ ...scope, epoch: '9002-0', cursor: '9003-0' }, { ...payload, finished: true })
        ).toBe(true)
        expect(await snapshots.save({ ...scope, epoch: '9002-0', cursor: '9999-0' }, payload)).toBe(false)
        expect((await snapshots.load(tenantId, 'thread', runId))?.finished).toBe(true)
    })

    it('rolls the cursor back if its message projection cannot commit', async () => {
        await database.query(`UPDATE chat_message SET status = 'thinking'`)
        await database.query(
            `ALTER TABLE chat_message ADD CONSTRAINT reject_progress CHECK (content::text <> '"reject"')`
        )
        await expect(
            snapshots.save(
                { ...scope, epoch: '9004-0', cursor: '9005-0' },
                {
                    ...payload,
                    messages: [{ ...payload.messages[0], content: 'reject' }]
                }
            )
        ).rejects.toThrow()
        expect((await database.query('SELECT cursor FROM run_stream_snapshot'))[0].cursor).toBe('9003-0')
    })

    it('archives a crashed producer tail before expiry and replays it after Redis eviction', async () => {
        const archivedRun = '00000000-0000-4000-8000-000000000003'
        const threadId = 'crashed-thread'
        const archiveService = new RunStreamArchiveService(database, redis as never)
        const streams = new RedisSseStreamService(
            redis as never,
            snapshots,
            { cancelExecutions: jest.fn() } as never,
            archiveService
        )
        await database.query(
            `INSERT INTO xpert_agent_execution (id, "tenantId", "threadId", status, error)
            VALUES ($1, $2, $3, 'interrupted', 'owner lost')`,
            [archivedRun, tenantId, threadId]
        )
        const key = streams.getStreamKey(threadId, archivedRun)
        await snapshots.save({ tenantId, threadId, runId: archivedRun, epoch: '1000-0', cursor: '1002-0' }, payload)
        for (const [id, data] of [
            ['1000-0', { type: 'stream_start' }],
            ['1001-0', { type: 'message', data: 'prefix' }],
            ['1002-0', { type: 'message', data: 'saved boundary' }],
            ['1003-0', { type: 'message', data: 'unsaved tail' }]
        ] as const)
            await redis.xAdd(key, id, { data: JSON.stringify(data) })
        await redis.sendCommand(['XTRIM', key, 'MINID', '=', '1002-0'])
        await redis.set(streamProducerKey(key), '1', { PX: 90_000 })
        expect(await archiveService.archiveAbandonedStream(threadId, archivedRun)).toBe(false)
        await redis.del(streamProducerKey(key)) // simulate process disappearance and expired heartbeat
        expect(await archiveService.archiveAbandonedStream(threadId, archivedRun)).toBe(true)
        expect(await redis.ttl(key)).toBeGreaterThan(0)
        await redis.persist(key)
        expect(await archiveService.archiveAbandonedStream(threadId, archivedRun)).toBe(true)
        expect(
            (await archiveService.read(tenantId, threadId, archivedRun, '0-0', '1003-0', '1000-0', 100)).length
        ).toBe(2)
        await redis.del(key) // simulate TTL expiry after durable archival
        const context = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(tenantId)
        try {
            const { stream } = await streams.createSseStream({
                threadId,
                runId: archivedRun,
                mode: 'join',
                recovery: 'snapshot-v1',
                requireReplayStart: true,
                isRunFinished: async () => true
            })
            const events = await lastValueFrom(stream.pipe(toArray()))
            expect(events.map((event) => event.data)).toEqual([
                expect.objectContaining({ type: 'run_snapshot', cursor: '1002-0', finished: false }),
                { type: 'message', data: 'unsaved tail' },
                { type: 'complete', recovered: true, status: 'interrupted', error: 'owner lost' }
            ])
            const joined = await streams.createSseStream({
                threadId,
                runId: archivedRun,
                mode: 'join',
                lastEventId: '1003-0',
                recovery: 'snapshot-v1',
                requireReplayStart: true,
                isRunFinished: async () => true
            })
            expect((await lastValueFrom(joined.stream.pipe(toArray()))).map((event) => event.data)).toEqual([
                { type: 'complete', recovered: true, status: 'interrupted', error: 'owner lost' }
            ])
            expect(await archiveService.load('00000000-0000-4000-8000-000000000099', threadId, archivedRun)).toBeNull()
        } finally {
            context.mockRestore()
        }
    })

    it('keeps a newer Redis tail when a resumed writer races archival', async () => {
        const archivedRun = '00000000-0000-4000-8000-000000000004'
        const threadId = 'racing-thread'
        const key = `ai:sse:thread:${threadId}:run:${archivedRun}`
        const archiveService = new RunStreamArchiveService(database, redis as never)
        await database.query(
            `INSERT INTO xpert_agent_execution (id, "tenantId", "threadId", status, error)
            VALUES ($1, $2, $3, 'error', 'owner lost')`,
            [archivedRun, tenantId, threadId]
        )
        await redis.xAdd(key, '1-0', { data: JSON.stringify({ type: 'stream_start' }) })
        await redis.xAdd(key, '2-0', { data: JSON.stringify({ type: 'message', data: 'old' }) })
        const query = database.query.bind(database)
        const raced = jest.spyOn(database, 'query').mockImplementation(async (sql, parameters, runner) => {
            const result = await query(sql, parameters, runner)
            if (sql.startsWith('INSERT INTO run_stream_archive (')) {
                await redis.xAdd(key, '3-0', { data: JSON.stringify({ type: 'stream_start' }) })
            }
            return result
        })
        try {
            expect(await archiveService.archiveAbandonedStream(threadId, archivedRun)).toBe(false)
            expect(await redis.ttl(key)).toBe(-1)
            expect((await redis.xRevRange(key, '+', '-', { COUNT: 1 }))[0].id).toBe('3-0')
        } finally {
            raced.mockRestore()
            await redis.del(key)
        }
    })

    it('keeps more than 10000 active events, then removes only a committed prefix', async () => {
        const streams = new RedisSseStreamService(
            redis as never,
            snapshots,
            { cancelExecutions: jest.fn() } as never,
            { load: jest.fn().mockResolvedValue(null), read: jest.fn().mockResolvedValue([]) } as never
        )
        const thread = `retention-${Date.now()}`
        let boundary = ''
        for (let start = 0; start < 12000; start += 100) {
            const ids = await Promise.all(
                Array.from({ length: 100 }, (_, offset) =>
                    streams.appendEvent(thread, 'run', { type: 'message', data: `${start + offset + 1}` })
                )
            )
            if (start === 8900) boundary = ids[99]
        }
        const key = streams.getStreamKey(thread, 'run')
        expect(await redis.xLen(key)).toBe(12000)
        expect(await redis.ttl(key)).toBe(-1)
        await redis.sendCommand(['XTRIM', key, 'MINID', '=', boundary])
        expect(await redis.xLen(key)).toBe(3001) // boundary is retained to detect missing prefixes
        await streams.appendCompleteEvent(thread, 'run')
        expect(await redis.ttl(key)).toBe(-1) // no successful snapshot/archival yet
    }, 30_000)
})
