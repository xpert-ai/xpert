import { Inject, Injectable, Logger } from '@nestjs/common'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { randomUUID } from 'crypto'
import { Observable } from 'rxjs'
import { finalize, tap } from 'rxjs/operators'
import { getChatEventName, isControlledRunStreamEvent, serializeRunStreamPayload } from './run-stream-payload'

const SSE_COMPLETE_EVENT = 'complete'

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
}

export interface RedisStreamPersistenceTarget {
    transport: 'redis-stream'
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

    constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClientType) {}

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
        const maxLen = this.getStreamMaxLen()
        const ttlSeconds = this.getStreamTtlSeconds()

        try {
            const persistedData = serializeRunStreamPayload(data)
            const payload = JSON.stringify(persistedData ?? null)
            const args = ['XADD', streamKey, 'MAXLEN', '~', `${maxLen}`, '*', 'data', payload]
            const id = (await this.redis.sendCommand(args)) as string
            if (ttlSeconds > 0) {
                await this.redis.sendCommand(['EXPIRE', streamKey, `${ttlSeconds}`, 'NX'])
            }
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

        return stream.pipe(
            tap({
                next: (event) => {
                    this.appendEvent(threadId, runId, event.data).catch((error) => {
                        this.#logger.warn(`Failed to persist chat stream event: ${this.getErrorMessage(error)}`)
                    })
                },
                error: (error) => {
                    this.appendEvent(threadId, runId, {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_ERROR,
                        data: {
                            error: this.getErrorMessage(error)
                        }
                    }).catch((appendError) => {
                        this.#logger.warn(
                            `Failed to persist chat stream error event: ${this.getErrorMessage(appendError)}`
                        )
                    })
                }
            }),
            finalize(() => {
                this.appendCompleteEvent(threadId, runId).catch((error) => {
                    this.#logger.warn(`Failed to persist chat stream complete event: ${this.getErrorMessage(error)}`)
                })
            })
        )
    }

    async createSseStream(options: CreateSseStreamOptions) {
        const { threadId, runId } = options
        const streamKey = this.getStreamKey(threadId, runId)
        const connectionSetKey = this.getConnectionSetKey(threadId, runId)
        const connectionTtl = this.getConnectionTtlMs()
        const connectionId = randomUUID()
        const ownerKey = this.getConnectionOwnerKey(threadId, runId, connectionId)
        const owner = this.buildConnectionOwner(connectionId, options)
        await this.persistConnectionOwner(connectionSetKey, ownerKey, owner, connectionTtl)

        const stream = new Observable<SseMessageEvent>((subscriber) => {
            let active = true
            let readClient: RedisClientType | null = null
            let lastId = this.normalizeStartId(options.lastEventId, options.mode)
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
                    if (lastId !== '$') {
                        const replayEntries = await this.readRange(client, streamKey, lastId, readCount)
                        for (const entry of replayEntries) {
                            if (!active) return
                            if (emitEntry(entry)) {
                                return
                            }
                        }
                    }

                    while (active) {
                        const entries = await this.readNewEntries(client, streamKey, lastId, readCount, readBlockMs)
                        if (!entries.length) {
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

    private normalizeStartId(lastEventId: string | undefined, mode: 'create' | 'join') {
        const normalized = lastEventId?.trim()
        if (normalized) {
            return normalized
        }
        return '0-0'
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
