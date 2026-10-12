import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { IRuntimeStreamInterruption, RUNTIME_STREAM_INTERRUPTED_EVENT } from '@xpert-ai/contracts'
import type { AgentChatCallbackEnvelopePayload } from '@xpert-ai/plugin-sdk'
import { closeRedisSubscriber, REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { Observable } from 'rxjs'
import { t } from 'i18next'
import { StopHandoffMessageCommand } from './commands'

const AGENT_CHAT_REALTIME_CHANNEL_PREFIX = 'ai:handoff:agent-chat:'

@Injectable()
export class AgentChatRealtimeService implements OnModuleDestroy {
    readonly #logger = new Logger(AgentChatRealtimeService.name)
    readonly #subscribers = new Set<RedisClientType>()
    readonly #streams = new Set<() => void>()
    readonly #closingClients = new Set<Promise<void>>()
    #shuttingDown = false

    constructor(
        @Inject(REDIS_CLIENT)
        private readonly redis: RedisClientType,
        private readonly commandBus: CommandBus
    ) {}

    async onModuleDestroy() {
        const startedAt = Date.now()
        this.#shuttingDown = true
        this.#logger.debug(
            JSON.stringify({
                event: 'runtime.shutdown.agent-streams-interrupting',
                pid: process.pid,
                streams: this.#streams.size,
                redisSubscribers: this.#subscribers.size,
                closingClients: this.#closingClients.size
            })
        )
        // Notify clients before ending HTTP streams; EOF alone would be mistaken for a completed chat.
        for (const interrupt of [...this.#streams]) interrupt()
        // Interruptions schedule teardown; snapshot pending disconnects only after every stream was notified.
        await Promise.all([
            ...this.#closingClients,
            ...Array.from(this.#subscribers).map((client) => this.closeClient(client))
        ])
        this.#subscribers.clear()
        this.#logger.debug(
            JSON.stringify({
                event: 'runtime.shutdown.agent-streams-closed',
                pid: process.pid,
                streams: this.#streams.size,
                closingClients: this.#closingClients.size,
                durationMs: Date.now() - startedAt
            })
        )
    }

    getChannel(runId: string) {
        return `${AGENT_CHAT_REALTIME_CHANNEL_PREFIX}${runId}`
    }

    async publish(runId: string, payload: AgentChatCallbackEnvelopePayload) {
        try {
            await this.redis.publish(this.getChannel(runId), JSON.stringify(payload))
        } catch (error) {
            this.#logger.warn(`Failed to publish agent chat realtime event "${runId}": ${this.getErrorMessage(error)}`)
            throw error
        }
    }

    createStream(runId: string, start: () => Promise<void>): Observable<MessageEvent> {
        // Capture the request's language while its context still exists, before the shutdown signal.
        const interruption: IRuntimeStreamInterruption = {
            code: 'RUNTIME_RESTARTING',
            message: t('server-ai:Error.RuntimeRestartInterrupted', {
                defaultValue:
                    'The service is restarting and the live reply was interrupted. The task may still be running. Refresh the conversation to check its result.'
            })
        }
        return new Observable<MessageEvent>((subscriber) => {
            if (this.#shuttingDown) {
                // Requests admitted before drain can reach this service late; never start new work here.
                this.#logger.debug(
                    JSON.stringify({ event: 'runtime.shutdown.agent-stream-rejected', pid: process.pid })
                )
                subscriber.next({ type: RUNTIME_STREAM_INTERRUPTED_EVENT, data: interruption } as MessageEvent)
                subscriber.complete()
                return
            }
            const channel = this.getChannel(runId)
            let client: RedisClientType | null = null
            let closed = false
            let started = false
            let settled = false

            const close = async () => {
                const closing = client
                if (!closing) {
                    return
                }
                client = null
                this.#subscribers.delete(closing)
                const cleanup = this.closeClient(closing)
                this.#closingClients.add(cleanup)
                try {
                    await cleanup
                } finally {
                    this.#closingClients.delete(cleanup)
                }
            }

            const complete = () => {
                if (settled) {
                    return
                }
                settled = true
                subscriber.complete()
                void close()
            }
            const interrupt = () => {
                if (settled) return
                // Settle before notifying: frontend teardown must not cancel the background task.
                // This transport interruption says nothing about the business task's final status.
                settled = true
                subscriber.next({ type: RUNTIME_STREAM_INTERRUPTED_EVENT, data: interruption } as MessageEvent)
                subscriber.complete()
                void close()
            }
            this.#streams.add(interrupt)

            const emitErrorEvent = (error: unknown) => {
                if (settled) {
                    return
                }
                settled = true
                subscriber.next({
                    type: 'error',
                    data: this.getErrorMessage(error)
                } as MessageEvent)
                subscriber.complete()
                void close()
            }

            const handleMessage = (message: string) => {
                const payload = this.parsePayload(message)
                if (!payload) {
                    return
                }

                switch (payload.kind) {
                    case 'stream':
                        if (payload.event) {
                            subscriber.next(payload.event as MessageEvent)
                        }
                        return
                    case 'complete':
                        complete()
                        return
                    case 'error':
                        emitErrorEvent(payload.error || 'Agent chat dispatch failed')
                        return
                }
            }

            const init = async () => {
                try {
                    client = this.redis.duplicate()
                    this.#subscribers.add(client)
                    await client.connect()
                    if (closed) {
                        await close()
                        return
                    }

                    await client.subscribe(channel, handleMessage)
                    if (closed) {
                        await close()
                        return
                    }

                    started = true
                    await start()
                } catch (error) {
                    if (!closed) {
                        emitErrorEvent(error)
                    }
                    await close()
                }
            }

            void init()

            return () => {
                closed = true
                this.#streams.delete(interrupt)
                const shouldCancel = started && !settled
                void close()
                if (shouldCancel) {
                    void this.commandBus.execute(
                        new StopHandoffMessageCommand({
                            messageIds: [runId],
                            reason: 'SSE client disconnected'
                        })
                    )
                }
            }
        })
    }

    private parsePayload(message: string): AgentChatCallbackEnvelopePayload | null {
        try {
            const payload = JSON.parse(message) as AgentChatCallbackEnvelopePayload
            if (payload && typeof payload === 'object' && ['stream', 'complete', 'error'].includes(payload.kind)) {
                return payload
            }
        } catch (error) {
            this.#logger.warn(`Invalid agent chat realtime payload: ${this.getErrorMessage(error)}`)
        }
        return null
    }

    private async closeClient(client: RedisClientType) {
        await closeRedisSubscriber('agent-chat.redis', client)
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message
        }
        if (typeof error === 'string') {
            return error
        }
        return 'Unknown agent chat realtime error'
    }
}
