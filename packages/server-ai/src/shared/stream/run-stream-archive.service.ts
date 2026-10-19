// Invariants: archive the remaining Redis events before expiry; never reclaim a live producer.
// Expiry is conditional on the exact archived tail, so a resumed segment cannot inherit an old cleanup decision.
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import type { RedisClientType } from 'redis'
import { DataSource } from 'typeorm'
import { z } from 'zod'
import { RunStreamSnapshot } from './run-stream-snapshot.entity'
import { RunStreamArchive } from './run-stream-archive.entity'

export const streamProducerKey = (streamKey: string) => `${streamKey}:producer`
const terminalRun = z.object({ tenantId: z.string(), status: z.string(), error: z.string().nullable() })
const archivedEvents = z.array(z.object({ id: z.string().regex(/^\d+-\d+$/), data: z.unknown() }))
const EXPIRE_ARCHIVED = `
if redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
local tail = redis.call('XREVRANGE', KEYS[1], '+', '-', 'COUNT', 1)
if #tail == 0 or tail[1][1] ~= ARGV[1] then return 0 end
return redis.call('EXPIRE', KEYS[1], ARGV[2])`

@Injectable()
export class RunStreamArchiveService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RunStreamArchiveService.name)
    private timer?: ReturnType<typeof setInterval>
    private scanning = false
    private scanCursor = 0
    private stopping = false

    constructor(
        @InjectDataSource() private readonly database: DataSource,
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType
    ) {}

    onModuleInit() {
        this.timer = setInterval(() => void this.reconcile(), 60_000)
        this.timer.unref()
    }
    onModuleDestroy() {
        this.stopping = true
        clearInterval(this.timer)
    }

    async reconcile() {
        if (this.scanning || this.stopping) return
        this.scanning = true
        try {
            const page = await this.redis.scan(this.scanCursor, { MATCH: 'ai:sse:thread:*:run:*', COUNT: 100 })
            this.scanCursor = page.cursor
            for (const key of page.keys) {
                if (this.stopping) break
                const match = /^ai:sse:thread:([^:]+):run:([0-9a-f-]{36})$/.exec(key)
                if (!match) continue
                try {
                    await this.archiveAbandonedStream(match[1], match[2])
                } catch (error) {
                    this.logger.warn(`Stream archival failed; retaining Redis replay: ${error}`)
                }
            }
        } catch (error) {
            this.logger.warn(`Stream archive scan failed; will retry: ${error}`)
        } finally {
            this.scanning = false
        }
    }

    async archiveAbandonedStream(threadId: string, runId: string): Promise<boolean> {
        const key = `ai:sse:thread:${threadId}:run:${runId}`
        if ((await this.redis.ttl(key)) !== -1 || (await this.redis.exists(streamProducerKey(key)))) return false
        const raw: unknown = await this.database.query(
            `SELECT "tenantId", status, error FROM xpert_agent_execution WHERE id = $1 AND "threadId" = $2`,
            [runId, threadId]
        )
        const run = z.array(terminalRun).parse(raw)[0]
        if (!run || !['success', 'error', 'interrupted', 'timeout'].includes(run.status)) return false
        const tail = await this.redis.xRevRange(key, '+', '-', { COUNT: 1 })
        const cursor = tail[0]?.id
        // Also protects old writers during mixed-version rollout, before they have a producer heartbeat.
        if (!cursor || Number(cursor.split('-')[0]) > Date.now() - 90_000) return false
        const scope = [run.tenantId, threadId, runId]
        const snapshot = await this.database
            .getRepository(RunStreamSnapshot)
            .findOne({ where: { tenantId: run.tenantId, threadId, runId } })
        let epoch = snapshot?.epoch ?? '0-0'
        let after = '0-0'
        while (!this.stopping) {
            const entries = await this.redis.xRange(key, `(${after}`, cursor, { COUNT: 500 })
            if (!entries.length) break
            const values = entries.map((entry) => {
                const data: unknown = JSON.parse(entry.message.data)
                if (data && typeof data === 'object' && 'type' in data && data.type === 'stream_start') epoch = entry.id
                return { id: randomUUID(), cursor: entry.id, data }
            })
            await this.database.query(
                `INSERT INTO run_stream_archived_event
                (id, "tenantId", "threadId", "runId", cursor, data)
                SELECT (entry->>'id')::uuid, $1, $2, $3, entry->>'cursor', entry->'data'
                FROM jsonb_array_elements($4::jsonb) entry
                ON CONFLICT ("tenantId", "threadId", "runId", cursor) DO NOTHING`,
                [...scope, JSON.stringify(values)]
            )
            after = entries[entries.length - 1].id
        }
        if (this.stopping || after !== cursor) return false
        await this.database.query(
            `INSERT INTO run_stream_archive (id, "tenantId", "threadId", "runId", cursor, epoch, status, error)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT ("tenantId", "threadId", "runId") DO UPDATE SET cursor = EXCLUDED.cursor,
              epoch = EXCLUDED.epoch, status = EXCLUDED.status, error = EXCLUDED.error, "updatedAt" = now()
            WHERE string_to_array(run_stream_archive.cursor, '-')::numeric[] <= string_to_array(EXCLUDED.cursor, '-')::numeric[]`,
            [randomUUID(), ...scope, cursor, epoch, run.status, run.error]
        )
        const ttl = Number(process.env.AI_SSE_STREAM_TTL_SECONDS ?? 86400)
        if (!(ttl > 0)) return false
        return (
            (await this.redis.eval(EXPIRE_ARCHIVED, {
                keys: [key, streamProducerKey(key)],
                arguments: [cursor, String(ttl)]
            })) === 1
        )
    }

    load(tenantId: string, threadId: string, runId: string) {
        return this.database.getRepository(RunStreamArchive).findOne({ where: { tenantId, threadId, runId } })
    }

    async read(
        tenantId: string,
        threadId: string,
        runId: string,
        after: string,
        through: string,
        epoch: string,
        count: number
    ) {
        const parsed = archivedEvents.parse(
            await this.database.query(
                `SELECT cursor AS id, data FROM run_stream_archived_event
            WHERE "tenantId" = $1 AND "threadId" = $2 AND "runId" = $3
              AND string_to_array(cursor, '-')::numeric[] > string_to_array($4, '-')::numeric[]
              AND string_to_array(cursor, '-')::numeric[] <= string_to_array($5, '-')::numeric[]
              AND string_to_array(cursor, '-')::numeric[] >= string_to_array($6, '-')::numeric[]
            ORDER BY string_to_array(cursor, '-')::numeric[] LIMIT $7`,
                [tenantId, threadId, runId, after, through, epoch, count]
            )
        )
        return parsed.map((entry) => ({ id: entry.id, data: entry.data }))
    }
}
