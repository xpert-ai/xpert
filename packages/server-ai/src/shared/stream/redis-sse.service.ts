import { Inject, Injectable, Logger } from '@nestjs/common'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { randomUUID } from 'crypto'
import { Observable } from 'rxjs'
import { share } from 'rxjs/operators'
import { serializeRunStreamPayload } from './run-stream-payload'
import { DisplaySnapshotCapture } from './display-snapshot/display-snapshot.capture'
import {
    DisplaySnapshotScope,
    DisplaySnapshotWriter,
    RunDisplaySnapshotStore
} from './display-snapshot/display-snapshot.store'

const SSE_COMPLETE_EVENT = 'complete'
const APPEND_EVENT_SCRIPT = `
local id = redis.call('XADD', KEYS[1], '*', 'data', ARGV[2])
redis.call('XTRIM', KEYS[1], 'MAXLEN', '~', ARGV[1])
if tonumber(ARGV[3]) > 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return id
`

interface StreamEntry {
    id: string
    data: unknown
}

export interface SseMessageEvent {
    data: unknown
    id?: string
    type?: string
    retry?: number
}

interface CreateSseStreamOptions {
    threadId: string
    runId: string
    lastEventId?: string
    mode: 'create' | 'join'
    owner?: SseConnectionOwnerCandidate
    requireReplayStart?: boolean
    isRunFinished?: () => Promise<boolean>
    snapshotScope?: DisplaySnapshotScope
}

export interface RedisStreamPersistenceTarget {
    transport: 'redis-stream'
    snapshotOwner?: string
    snapshotScope?: DisplaySnapshotScope
    threadId?: string | null
    runId?: string | null
}

export interface ChatStreamPersistenceOptions {
    target?: RedisStreamPersistenceTarget | null
    threadId?: string | null
    runId?: string | null
}

export interface SseConnectionOwnerCandidate {
    mode: 'create' | 'join'
    requestId?: string | null
    userId?: string | null
    ip?: string | null
    forwardedFor?: string | null
    userAgent?: string | null
    origin?: string | null
    referer?: string | null
    method?: string | null
    endpoint?: string | null
    lastEventId?: string | null
}

export interface SseConnectionOwner extends SseConnectionOwnerCandidate {
    connectionId: string
    connectedAt: string
}

@Injectable()
export class RedisSseStreamService {
    readonly #logger = new Logger(RedisSseStreamService.name)

    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
        private readonly snapshots: RunDisplaySnapshotStore
    ) {}

    getStreamKey(threadId: string, runId: string) {
        return `ai:sse:thread:${threadId}:run:${runId}`
    }

    getConnectionSetKey(threadId: string, runId: string) {
        return `ai:sse:connections:thread:${threadId}:run:${runId}`
    }

    getConnectionOwnerKey(threadId: string, runId: string, connectionId: string) {
        return `ai:sse:connection:thread:${threadId}:run:${runId}:${connectionId}`
    }

    async appendEvent(threadId: string, runId: string, data: unknown, protectedTail = false) {
        const streamKey = this.getStreamKey(threadId, runId)
        const maxLen = this.getStreamMaxLen() * (protectedTail ? 4 : 1)
        const ttlSeconds = this.getStreamTtlSeconds()

        try {
            const persistedData = serializeRunStreamPayload(data)
            const payload = JSON.stringify(persistedData ?? null)
            const id = (await this.redis.eval(APPEND_EVENT_SCRIPT, {
                keys: [streamKey],
                arguments: [`${maxLen}`, payload, `${ttlSeconds}`]
            })) as string
            return id
        } catch (error) {
            this.#logger.warn(`Failed to append SSE event: ${error}`)
            return null
        }
    }

    async appendCompleteEvent(threadId: string, runId: string, payload?: Record<string, unknown>) {
        return this.appendEvent(threadId, runId, { ...(payload ?? {}), type: SSE_COMPLETE_EVENT })
    }

    wrapChatStream(
        stream: Observable<MessageEvent>,
        options?: ChatStreamPersistenceOptions | null
    ): Observable<MessageEvent> {
        const target = options?.target
        if (target?.transport !== 'redis-stream') {
            return stream
        }

        const threadId = this.normalizeId(target.threadId) ?? this.normalizeId(options?.threadId)
        const runId = this.normalizeId(target.runId) ?? this.normalizeId(options?.runId)
        if (!threadId || !runId) {
            this.#logger.warn('Skip chat stream persistence because threadId or runId is missing')
            return stream
        }

        // One producer, ordered durable writes, completion only after the last write.
        // Observers can leave without cancelling the admitted model execution.
        return new Observable<MessageEvent>((subscriber) => {
            let failed = false
            let writer: DisplaySnapshotWriter | null = null
            let revision = 0
            let lastWrittenId: string | null = null
            let savedRevision = 0
            let retryClaimAt = 0
            const capture = new DisplaySnapshotCapture()
            const protectedTail = Boolean(target.snapshotOwner && target.snapshotScope)
            const claimWriter = async () => {
                if (!protectedTail || writer || Date.now() < retryClaimAt) return
                retryClaimAt = Infinity
                try {
                    writer = await this.snapshots.begin(target.snapshotScope, threadId, runId, target.snapshotOwner)
                } catch {
                    retryClaimAt = Date.now() + 1000
                    this.#logger.warn('Display snapshot initialization failed; retaining the bounded uncovered tail')
                }
            }
            const saveDisplay = async (
                display: ReturnType<DisplaySnapshotCapture['capture']>,
                version: number,
                id: string | null
            ) => {
                if (!display || !id || failed || version <= savedRevision) return
                await claimWriter()
                if (!writer) return
                try {
                    const saved = await this.snapshots.save(writer, version, id, display)
                    if (saved) {
                        savedRevision = version
                        await this.trimCoveredEvents(threadId, runId, id)
                    }
                } catch {
                    this.#logger.warn('Display snapshot persistence failed; retaining the bounded uncovered tail')
                }
            }
            let writes = (async () => {
                await claimWriter()
                const id = protectedTail
                    ? await this.appendEvent(threadId, runId, { type: 'stream_start' }, true)
                    : await this.appendEvent(threadId, runId, { type: 'stream_start' })
                failed ||= !id
            })()
            const enqueue = (data: unknown, event?: MessageEvent) => {
                let snapshot: unknown
                let display: ReturnType<DisplaySnapshotCapture['capture']> = null
                const eventRevision = ++revision
                try {
                    snapshot = JSON.parse(JSON.stringify(serializeRunStreamPayload(data) ?? null))
                    display = protectedTail ? capture.capture(snapshot) : null
                } catch {
                    failed = true
                    this.#logger.warn('SSE event could not be serialized; readers will reconcile committed messages')
                    writes = writes.then(() => {
                        if (event) subscriber.next(event)
                    })
                    return
                }
                writes = writes.then(async () => {
                    const id = protectedTail
                        ? await this.appendEvent(threadId, runId, snapshot, true)
                        : await this.appendEvent(threadId, runId, snapshot)
                    failed ||= !id
                    lastWrittenId = id
                    await saveDisplay(display, eventRevision, id)
                    if (event) subscriber.next(event)
                })
            }
            // A quiet long-running tool still gets its last display saved after a transient DB outage.
            // Capture now, then queue the write after exactly the events represented by this projection.
            const flushTimer = protectedTail
                ? setInterval(() => {
                      if (revision <= savedRevision) return
                      let display: ReturnType<DisplaySnapshotCapture['capture']>
                      try {
                          display = capture.capture({ type: 'complete' })
                      } catch {
                          return
                      }
                      const version = revision
                      writes = writes.then(() => saveDisplay(display, version, lastWrittenId))
                  }, 1000)
                : null
            flushTimer?.unref()
            const finish = (error?: unknown) => {
                if (flushTimer) clearInterval(flushTimer)
                // Completion is also a synchronous boundary; drain the final coalesced text before closing the transport.
                let finalDisplay: ReturnType<DisplaySnapshotCapture['capture']> = null
                try {
                    finalDisplay = protectedTail ? capture.capture({ type: 'complete' }) : null
                } catch {
                    failed = true
                }
                const finalRevision = ++revision
                writes = writes
                    .then(async () => {
                        await saveDisplay(finalDisplay, finalRevision, lastWrittenId)
                        if (failed) await this.appendEvent(threadId, runId, { type: 'stream_resync' })
                        if (protectedTail) await this.appendEvent(threadId, runId, { type: SSE_COMPLETE_EVENT }, true)
                        else await this.appendCompleteEvent(threadId, runId)
                        if (error) subscriber.error(error)
                        else subscriber.complete()
                    })
                    .catch((error) => subscriber.error(error))
            }
            stream.subscribe({
                next: (event) => enqueue(event.data, event),
                error: (error) => {
                    enqueue({
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_ERROR,
                        data: { error: this.getErrorMessage(error) }
                    })
                    finish(error)
                },
                complete: () => finish()
            })
        }).pipe(share({ resetOnComplete: false, resetOnError: false, resetOnRefCountZero: false }))
    }

    async createSseStream(options: CreateSseStreamOptions) {
        const { threadId, runId } = options
        const streamKey = this.getStreamKey(threadId, runId)
        // A POST starts a new stream segment even when tool_after reuses the run id.
        // Snapshot the tail before the producer starts; '$' would lose events during setup.
        const cursorKey = `ai:sse:segment:thread:${threadId}:run:${runId}`
        let startId: string
        if (options.mode === 'create') {
            startId = await this.readTailId(streamKey)
            const ttl = this.getStreamTtlSeconds()
            await this.redis.set(cursorKey, startId, ttl > 0 ? { EX: ttl } : undefined)
        } else {
            const segmentStart = (await this.redis.get(cursorKey)) ?? '0-0'
            startId = this.joinCursor(options.lastEventId, segmentStart)
        }
        const connectionSetKey = this.getConnectionSetKey(threadId, runId)
        const connectionTtl = this.getConnectionTtlMs()
        const connectionId = randomUUID()
        const ownerKey = this.getConnectionOwnerKey(threadId, runId, connectionId)
        const owner = this.buildConnectionOwner(connectionId, options)
        await this.persistConnectionOwner(connectionSetKey, ownerKey, owner, connectionTtl)

        const stream = new Observable<SseMessageEvent>((subscriber) => {
            let active = true
            let readClient: RedisClientType | null = null
            let lastId = startId
            const readBlockMs = this.getReadBlockMs()
            const readCount = this.getReadCount()

            const emitEntry = (entry: StreamEntry) => {
                if (!active) return true
                const isComplete = this.isCompletePayload(entry.data)
                const message: SseMessageEvent = {
                    id: entry.id,
                    data: entry.data,
                    ...(isComplete ? { type: SSE_COMPLETE_EVENT } : {})
                }
                subscriber.next(message)
                lastId = entry.id
                if (isComplete) {
                    active = false
                    subscriber.complete()
                    return true
                }
                return false
            }

            const refreshInterval = setInterval(
                () => {
                    this.refreshConnectionOwner(ownerKey, connectionSetKey, connectionTtl).catch((err) => {
                        this.#logger.warn(`Failed to refresh SSE connection metadata: ${err}`)
                    })
                },
                Math.max(Math.floor(connectionTtl / 2), 1000)
            )

            const run = async () => {
                try {
                    readClient = await this.createReadClient()
                    if (!active) {
                        this.closeReadClient(readClient)
                        readClient = null
                        return
                    }
                    const client = readClient ?? this.redis
                    let checkedAt = 0
                    let finished = false
                    const checkAccess = async () => {
                        if (options.isRunFinished && Date.now() - checkedAt >= 2000) {
                            finished = await options.isRunFinished()
                            checkedAt = Date.now()
                        }
                        return finished
                    }
                    await checkAccess()
                    const resync = () => {
                        subscriber.next({
                            data: { type: 'stream_resync', ...(options.snapshotScope ? { retryable: !finished } : {}) }
                        })
                        subscriber.next({ type: SSE_COMPLETE_EVENT, data: { type: SSE_COMPLETE_EVENT } })
                        subscriber.complete()
                        active = false
                    }
                    const repairGap = async (): Promise<boolean> => {
                        const first = (await this.readRange(client, streamKey, '0-0', 1))[0]
                        const missing = first
                            ? lastId !== '0-0'
                                ? compareStreamIds(first.id, lastId) > 0
                                : !isStreamStart(first.data)
                            : true
                        if (!missing) return true
                        if (options.snapshotScope) {
                            const saved = await this.snapshots.read(options.snapshotScope, threadId, runId)
                            if (saved && compareStreamIds(saved.cursor, startId) >= 0) {
                                // Retain the cursor entry itself as the continuity anchor; never infer adjacent Redis ids.
                                const anchor = (await client.sendCommand([
                                    'XRANGE',
                                    streamKey,
                                    saved.cursor,
                                    saved.cursor,
                                    'COUNT',
                                    '1'
                                ])) as unknown[]
                                const continuous = Boolean(anchor?.length)
                                subscriber.next({
                                    id: saved.cursor,
                                    data: { type: 'stream_snapshot', snapshot: saved, continuous }
                                })
                                lastId = saved.cursor
                                if (continuous) return true
                            }
                        }
                        if (first || finished || options.snapshotScope) {
                            resync()
                            return false
                        }
                        return true
                    }
                    if (options.requireReplayStart && !(await repairGap())) return
                    if (lastId !== '$') {
                        const replayEntries = await this.readRange(client, streamKey, lastId, readCount)
                        if (options.requireReplayStart && !(await repairGap())) return
                        for (const entry of replayEntries) {
                            if (!active) return
                            if (compareStreamIds(entry.id, lastId) <= 0) continue
                            if (emitEntry(entry)) {
                                return
                            }
                        }
                    }

                    while (active) {
                        await checkAccess()
                        if (options.requireReplayStart && !(await repairGap())) return
                        const entries = await this.readNewEntries(client, streamKey, lastId, readCount, readBlockMs)
                        if (!entries.length) {
                            if (await checkAccess()) {
                                resync()
                                return
                            }
                            continue
                        }
                        if (options.requireReplayStart && !(await repairGap())) return
                        for (const entry of entries) {
                            if (!active) return
                            if (compareStreamIds(entry.id, lastId) <= 0) continue
                            if (emitEntry(entry)) {
                                return
                            }
                        }
                    }
                } catch (error) {
                    if (active) {
                        subscriber.error(error)
                    }
                }
            }

            run()

            return () => {
                active = false
                clearInterval(refreshInterval)
                this.closeReadClient(readClient)
                this.releaseConnection(threadId, runId, connectionId).catch((err) => {
                    this.#logger.warn(`Failed to release SSE connection metadata: ${err}`)
                })
            }
        })

        return { connectionId, owner, ttlMs: connectionTtl, stream }
    }

    private async trimCoveredEvents(threadId: string, runId: string, cursor: string) {
        await this.redis.eval(
            `
            if redis.call('XLEN', KEYS[1]) > tonumber(ARGV[1]) then
                return redis.call('XTRIM', KEYS[1], 'MINID', '=', ARGV[2])
            end
            return 0`,
            { keys: [this.getStreamKey(threadId, runId)], arguments: [String(this.getStreamMaxLen()), cursor] }
        )
    }

    async releaseConnection(threadId: string, runId: string, connectionId: string) {
        const connectionSetKey = this.getConnectionSetKey(threadId, runId)
        const ownerKey = this.getConnectionOwnerKey(threadId, runId, connectionId)
        return this.releaseConnectionByKey(ownerKey, connectionSetKey, connectionId)
    }

    private async createReadClient(): Promise<RedisClientType | null> {
        if (typeof this.redis.duplicate !== 'function') {
            return null
        }

        try {
            const client = this.redis.duplicate()
            await client.connect()
            return client
        } catch (error) {
            this.#logger.warn(`Failed to create dedicated SSE read client: ${error}`)
            return null
        }
    }

    private closeReadClient(client: RedisClientType | null) {
        if (!client) {
            return
        }
        client.quit().catch((error) => {
            this.#logger.warn(`Failed to close dedicated SSE read client: ${error}`)
        })
    }

    private async readRange(
        client: RedisClientType,
        streamKey: string,
        lastId: string,
        count: number
    ): Promise<StreamEntry[]> {
        const rangeArgs = ['XRANGE', streamKey, `(${lastId}`, '+', 'COUNT', `${count}`]
        const response = (await client.sendCommand(rangeArgs)) as Array<[string, string[]]> | null
        if (!response || response.length === 0) {
            return []
        }
        return response.map(([id, fields]) => ({ id, data: this.extractData(fields) }))
    }

    private async readNewEntries(
        client: RedisClientType,
        streamKey: string,
        lastId: string,
        count: number,
        blockMs: number
    ): Promise<StreamEntry[]> {
        const args = ['XREAD', 'COUNT', `${count}`, 'BLOCK', `${blockMs}`, 'STREAMS', streamKey, lastId]
        const response = (await client.sendCommand(args)) as Array<[string, Array<[string, string[]]>]> | null
        if (!response || response.length === 0) {
            return []
        }

        const [, entries] = response[0] ?? []
        if (!entries) {
            return []
        }

        return entries.map(([id, fields]) => ({ id, data: this.extractData(fields) }))
    }

    private extractData(fields: string[]) {
        let raw: string | null = null
        for (let i = 0; i < fields.length; i += 2) {
            if (fields[i] === 'data') {
                raw = fields[i + 1]
                break
            }
        }
        if (!raw) {
            return null
        }
        try {
            return JSON.parse(raw)
        } catch (error) {
            return raw
        }
    }

    private isCompletePayload(data: unknown) {
        return typeof data === 'object' && data !== null && (data as { type?: string }).type === SSE_COMPLETE_EVENT
    }

    private async readTailId(streamKey: string): Promise<string> {
        const entries = (await this.redis.sendCommand(['XREVRANGE', streamKey, '+', '-', 'COUNT', '1'])) as Array<
            [string, string[]]
        > | null
        return entries?.[0]?.[0] ?? '0-0'
    }

    private joinCursor(lastEventId: string | undefined, segmentStart: string): string {
        const requested = lastEventId?.trim()
        if (!requested) return segmentStart
        if (!/^\d+-\d+$/.test(requested)) return requested
        const [requestedMs, requestedSeq] = requested.split('-').map(BigInt)
        const [startMs, startSeq] = segmentStart.split('-').map(BigInt)
        return requestedMs < startMs || (requestedMs === startMs && requestedSeq < startSeq) ? segmentStart : requested
    }

    private normalizeId(value: string | null | undefined) {
        const normalized = value?.trim()
        return normalized ? normalized : null
    }

    private getErrorMessage(error: unknown) {
        if (error instanceof Error) {
            return error.message
        }
        if (typeof error === 'string') {
            return error
        }
        return 'Unknown chat stream persistence error'
    }

    private buildConnectionOwner(connectionId: string, options: CreateSseStreamOptions): SseConnectionOwner {
        const owner = options.owner ?? { mode: options.mode }
        return {
            connectionId,
            connectedAt: new Date().toISOString(),
            mode: owner.mode ?? options.mode,
            requestId: this.normalizeOwnerValue(owner.requestId),
            userId: this.normalizeOwnerValue(owner.userId),
            ip: this.normalizeOwnerValue(owner.ip),
            forwardedFor: this.normalizeOwnerValue(owner.forwardedFor),
            userAgent: this.normalizeOwnerValue(owner.userAgent),
            origin: this.normalizeOwnerValue(owner.origin),
            referer: this.normalizeOwnerValue(owner.referer),
            method: this.normalizeOwnerValue(owner.method),
            endpoint: this.normalizeOwnerValue(owner.endpoint),
            lastEventId: this.normalizeOwnerValue(owner.lastEventId)
        }
    }

    private normalizeOwnerValue(value?: string | null) {
        const normalized = value?.trim()
        return normalized ? normalized : null
    }

    private async persistConnectionOwner(
        connectionSetKey: string,
        ownerKey: string,
        owner: SseConnectionOwner,
        ttl: number
    ) {
        try {
            await this.redis.set(ownerKey, JSON.stringify(owner), { PX: ttl })
            await this.redis.sendCommand(['SADD', connectionSetKey, owner.connectionId])
            await this.redis.pExpire(connectionSetKey, ttl)
        } catch (error) {
            this.#logger.warn(`Failed to persist SSE connection metadata: ${error}`)
        }
    }

    private async refreshConnectionOwner(ownerKey: string, connectionSetKey: string, ttl: number) {
        await this.redis.pExpire(ownerKey, ttl)
        await this.redis.pExpire(connectionSetKey, ttl)
    }

    private async releaseConnectionByKey(ownerKey: string, connectionSetKey: string, connectionId: string) {
        const script = `
			redis.call("del", KEYS[1])
			redis.call("srem", KEYS[2], ARGV[1])
			return 1
		`
        const result = await this.redis.eval(script, { keys: [ownerKey, connectionSetKey], arguments: [connectionId] })
        return result === 1
    }

    private getStreamMaxLen() {
        return Number(process.env.AI_SSE_STREAM_MAXLEN ?? 10000)
    }

    private getStreamTtlSeconds() {
        return Number(process.env.AI_SSE_STREAM_TTL_SECONDS ?? 86400)
    }

    private getConnectionTtlMs() {
        return Number(process.env.AI_SSE_LOCK_TTL_MS ?? 30000)
    }

    private getReadBlockMs() {
        return Number(process.env.AI_SSE_READ_BLOCK_MS ?? 200)
    }

    private getReadCount() {
        return Number(process.env.AI_SSE_READ_COUNT ?? 500)
    }
}

function isStreamStart(value: unknown) {
    return !!value && typeof value === 'object' && 'type' in value && value.type === 'stream_start'
}
function compareStreamIds(a: string, b: string) {
    const [aTime, aSeq] = a.split('-').map(BigInt),
        [bTime, bSeq] = b.split('-').map(BigInt)
    return aTime === bTime ? (aSeq > bSeq ? 1 : aSeq < bSeq ? -1 : 0) : aTime > bTime ? 1 : -1
}
