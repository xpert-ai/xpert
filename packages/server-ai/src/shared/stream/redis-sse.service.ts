import { RunStreamArchiveService, streamProducerKey } from './run-stream-archive.service'
import { t } from 'i18next'
import { ExecutionCancelService } from '../execution/execution-cancel.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IChatMessage } from '@xpert-ai/contracts'
import { RunStreamSnapshotService } from './run-stream-snapshot.service'
import { RunStreamSnapshotWriter } from './run-stream-snapshot-writer'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { randomUUID } from 'crypto'
import { Observable } from 'rxjs'
import { share } from 'rxjs/operators'
import { serializeRunStreamPayload } from './run-stream-payload'

const SSE_COMPLETE_EVENT = 'complete'
const PERSISTENCE_CAPACITY_MESSAGE =
    'Progress persistence reached its capacity limit. The run was stopped and existing output was retained.'
const APPEND_EVENT_SCRIPT = `
local id = redis.call('XADD', KEYS[1], '*', 'data', ARGV[1])
redis.call('PERSIST', KEYS[1])
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
    recovery?: 'snapshot-v1'
    isRunFinished?: () => Promise<boolean>
}

export interface RedisStreamPersistenceTarget {
    transport: 'redis-stream'
    threadId?: string | null
    runId?: string | null
}

export interface ChatStreamPersistenceOptions {
    currentMessage?: () => Partial<IChatMessage> | null | undefined
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
        private readonly snapshots: RunStreamSnapshotService,
        private readonly cancellations: ExecutionCancelService,
        private readonly archives: RunStreamArchiveService
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

    async appendEvent(threadId: string, runId: string, data: unknown) {
        const streamKey = this.getStreamKey(threadId, runId)

        try {
            const persistedData = serializeRunStreamPayload(data)
            const payload = JSON.stringify(persistedData ?? null)
            const id = (await this.redis.eval(APPEND_EVENT_SCRIPT, {
                keys: [streamKey],
                arguments: [payload]
            })) as string
            return id
        } catch (error) {
            this.#logger.warn(`Failed to append SSE event: ${error}`)
            return null
        }
    }

    async appendCompleteEvent(threadId: string, runId: string, payload?: Record<string, unknown>) {
        const id = await this.appendEvent(threadId, runId, { ...(payload ?? {}), type: SSE_COMPLETE_EVENT })
        return id
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

        const tenantId = RequestContext.currentTenantId()
        // One producer, ordered durable writes, completion only after the last write.
        // Observers can leave without cancelling the admitted model execution.
        return new Observable<MessageEvent>((subscriber) => {
            const producerKey = streamProducerKey(this.getStreamKey(threadId, runId))
            const keepProducer = () => this.redis.set(producerKey, '1', { PX: 90_000 })
            const heartbeat = setInterval(() => {
                void keepProducer().catch((error) => this.#logger.warn(`Producer heartbeat failed: ${error}`))
            }, 30_000)
            heartbeat.unref()
            let failed = false
            let producedBytes = 0
            let committedBytes = 0
            let stoppingForCapacity = false
            const configuredBudget = Number(process.env.AI_SSE_UNCHECKPOINTED_MAX_BYTES)
            const budget =
                Number.isSafeInteger(configuredBudget) && configuredBudget > 0 ? configuredBudget : 64 * 1024 * 1024
            let epoch: string | null = null
            let persistedCursor: string | null = null
            const snapshotWriter = new RunStreamSnapshotWriter()
            const persistSnapshot = async (
                cursor: string,
                payload: ReturnType<RunStreamSnapshotWriter['capture']>,
                boundaryBytes: number
            ) => {
                if (!payload || failed || !epoch || !tenantId) return false
                try {
                    const saved = await this.snapshots.save({ tenantId, threadId, runId, epoch, cursor }, payload)
                    if (saved) {
                        committedBytes = Math.max(committedBytes, boundaryBytes)
                        // Only committed progress may be trimmed; retain its boundary event for gap detection.
                        await this.redis.sendCommand([
                            'XTRIM',
                            this.getStreamKey(threadId, runId),
                            'MINID',
                            '=',
                            cursor
                        ])
                    }
                    return saved
                } catch (error) {
                    this.#logger.warn(`Snapshot persistence failed; retaining Redis replay: ${error}`)
                    return false
                }
            }
            const initialMessageId = options?.currentMessage?.()?.id
            let writes = keepProducer()
                .catch((error) => {
                    failed = true
                    this.#logger.warn(`Producer registration failed: ${error}`)
                })
                .then(() =>
                    this.appendEvent(threadId, runId, {
                        type: 'stream_start',
                        ...(initialMessageId ? { messageId: initialMessageId } : {})
                    })
                )
                .then((id) => {
                    failed ||= !id
                    epoch = id
                    persistedCursor = id
                })
            const captureProgress = (finished = false) => {
                try {
                    return snapshotWriter.capture(finished)
                } catch {
                    this.#logger.warn('Unable to capture run snapshot; retaining Redis replay')
                    return null
                }
            }
            const enqueue = (data: unknown, event?: MessageEvent) => {
                snapshotWriter.observe(options?.currentMessage?.(), data)
                const progress = captureProgress()
                let snapshot: unknown
                try {
                    snapshot = JSON.parse(JSON.stringify(serializeRunStreamPayload(data) ?? null))
                } catch {
                    failed = true
                    this.#logger.warn('SSE event could not be serialized; readers will reconcile committed messages')
                    writes = writes.then(() => {
                        if (event) subscriber.next(event)
                    })
                    return
                }
                producedBytes += Buffer.byteLength(JSON.stringify(snapshot))
                const boundaryBytes = producedBytes
                if (!stoppingForCapacity && producedBytes - committedBytes > budget) {
                    stoppingForCapacity = true
                    void this.cancellations
                        .cancelExecutions(
                            [runId],
                            t('server-ai:Error.StreamPersistenceCapacity', {
                                defaultValue: PERSISTENCE_CAPACITY_MESSAGE
                            }) || PERSISTENCE_CAPACITY_MESSAGE
                        )
                        .catch((error) =>
                            this.#logger.error(`Failed to stop run after replay capacity was reached: ${error}`)
                        )
                }
                writes = writes.then(async () => {
                    const id = await this.appendEvent(threadId, runId, snapshot)
                    failed ||= !id
                    if (id) {
                        persistedCursor = id
                        await persistSnapshot(id, progress, boundaryBytes)
                    }
                    if (event) subscriber.next(event)
                })
            }
            const finish = (error?: unknown) => {
                snapshotWriter.observe(options?.currentMessage?.())
                const progress = captureProgress(true)
                writes = writes
                    .then(async () => {
                        if (failed) await this.appendEvent(threadId, runId, { type: 'stream_resync' })
                        const durable =
                            persistedCursor && (await persistSnapshot(persistedCursor, progress, producedBytes))
                        const completeId = await this.appendCompleteEvent(threadId, runId)
                        if (durable && completeId && this.getStreamTtlSeconds() > 0) {
                            await this.redis.expire(this.getStreamKey(threadId, runId), this.getStreamTtlSeconds())
                        }
                        if (error) subscriber.error(error)
                        else subscriber.complete()
                    })
                    .catch((error) => subscriber.error(error))
                    .finally(() => clearInterval(heartbeat))
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
        const tenantId = RequestContext.currentTenantId()
        const streamKey = this.getStreamKey(threadId, runId)
        const archive = tenantId ? await this.archives.load(tenantId, threadId, runId) : null
        // A POST starts a new stream segment even when tool_after reuses the run id.
        // Snapshot the tail before the producer starts; '$' would lose events during setup.
        const cursorKey = `ai:sse:segment:thread:${threadId}:run:${runId}`
        let segmentBoundary = '0-0'
        let startId: string
        if (options.mode === 'create') {
            startId = await this.readTailId(streamKey)
            if (archive && compareStreamIds(archive.cursor, startId) > 0) startId = archive.cursor
            segmentBoundary = startId
            const ttl = this.getStreamTtlSeconds()
            await this.redis.set(cursorKey, startId, ttl > 0 ? { EX: ttl } : undefined)
        } else {
            const segmentStart = (await this.redis.get(cursorKey)) ?? '0-0'
            segmentBoundary = segmentStart
            startId = this.joinCursor(options.lastEventId, segmentStart)
        }
        const connectionSetKey = this.getConnectionSetKey(threadId, runId)
        const connectionTtl = this.getConnectionTtlMs()
        const connectionId = randomUUID()
        const ownerKey = this.getConnectionOwnerKey(threadId, runId, connectionId)
        const owner = this.buildConnectionOwner(connectionId, options)
        await this.persistConnectionOwner(connectionSetKey, ownerKey, owner, connectionTtl)

        let archiveRelevant = archive && compareStreamIds(archive.cursor, segmentBoundary) > 0
        const recoveredCompletion = {
            type: SSE_COMPLETE_EVENT,
            recovered: true,
            status: archive?.status,
            error: archive?.error
        }
        const readReplay = async (client: RedisClientType, after: string, count: number) => {
            const live = (await this.readRange(client, streamKey, after, count)).filter(
                (entry) => !archiveRelevant || compareStreamIds(entry.id, archive.epoch) >= 0
            )
            if (!archiveRelevant || after === '$' || compareStreamIds(after, archive.cursor) >= 0) return live
            const saved = await this.archives.read(
                tenantId,
                threadId,
                runId,
                after,
                archive.cursor,
                archive.epoch,
                count
            )
            return [...new Map([...saved, ...live].map((entry) => [entry.id, entry])).values()]
                .sort((a, b) => compareStreamIds(a.id, b.id))
                .slice(0, count)
        }
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
                    data: isComplete && archiveRelevant ? recoveredCompletion : entry.data,
                    ...(isComplete ? { type: SSE_COMPLETE_EVENT } : {})
                }
                subscriber.next(message)
                lastId = entry.id
                if (!isComplete && archiveRelevant && entry.id === archive.cursor) {
                    subscriber.next({ type: SSE_COMPLETE_EVENT, data: recoveredCompletion })
                }
                if (isComplete || (archiveRelevant && entry.id === archive.cursor)) {
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
                        subscriber.next({ data: { type: 'stream_resync' } })
                        subscriber.next({ type: SSE_COMPLETE_EVENT, data: { type: SSE_COMPLETE_EVENT } })
                        subscriber.complete()
                        active = false
                    }
                    const recover = async (initial = false) => {
                        if (!options.requireReplayStart) return false
                        const first = (await readReplay(client, '0-0', 1))[0]
                        const gap = first
                            ? lastId === '0-0'
                                ? !isStreamStart(first.data)
                                : compareStreamIds(first.id, lastId) > 0
                            : finished
                        const wantsSnapshot =
                            options.recovery === 'snapshot-v1' && (gap || (initial && !options.lastEventId))
                        if (wantsSnapshot && tenantId) {
                            const snapshot = await this.snapshots.load(tenantId, threadId, runId)
                            if (
                                snapshot &&
                                compareStreamIds(snapshot.epoch, segmentBoundary) > 0 &&
                                compareStreamIds(snapshot.cursor, lastId) >= 0
                            ) {
                                if (archiveRelevant && compareStreamIds(snapshot.epoch, archive.cursor) > 0)
                                    archiveRelevant = false
                                subscriber.next({ id: snapshot.cursor, data: snapshot })
                                lastId = snapshot.cursor
                                if (
                                    snapshot.finished &&
                                    !(archiveRelevant && compareStreamIds(archive.cursor, snapshot.cursor) > 0)
                                ) {
                                    subscriber.next({
                                        type: SSE_COMPLETE_EVENT,
                                        data: archiveRelevant ? recoveredCompletion : { type: SSE_COMPLETE_EVENT }
                                    })
                                    subscriber.complete()
                                    active = false
                                }
                                return true
                            }
                        }
                        if (gap) {
                            resync()
                            return true
                        }
                        return false
                    }
                    await recover(true)
                    if (!active) return
                    if (archiveRelevant && compareStreamIds(lastId, archive.cursor) >= 0) {
                        subscriber.next({ type: SSE_COMPLETE_EVENT, data: recoveredCompletion })
                        subscriber.complete()
                        active = false
                        return
                    }
                    if (lastId !== '$') {
                        const replayEntries = await readReplay(client, lastId, readCount)
                        if (await recover()) {
                            if (!active) return
                        }
                        for (const entry of replayEntries) {
                            if (compareStreamIds(entry.id, lastId) <= 0) continue
                            if (!active) return
                            if (emitEntry(entry)) {
                                return
                            }
                        }
                    }

                    while (active) {
                        await checkAccess()
                        if (await recover()) {
                            if (!active) return
                            continue
                        }
                        const archived =
                            archiveRelevant && compareStreamIds(lastId, archive.cursor) < 0
                                ? await readReplay(client, lastId, readCount)
                                : []
                        const entries = archived.length
                            ? archived
                            : await this.readNewEntries(client, streamKey, lastId, readCount, readBlockMs)
                        if (!entries.length) {
                            if (await checkAccess()) {
                                resync()
                                return
                            }
                            continue
                        }
                        if (await recover()) {
                            if (!active) return
                            continue
                        }
                        for (const entry of entries) {
                            if (!active) return
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
