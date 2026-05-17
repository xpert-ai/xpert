import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import type { AgentChatCallbackEnvelopePayload } from '@xpert-ai/plugin-sdk'
import { REDIS_CLIENT } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { Observable } from 'rxjs'
import { StopHandoffMessageCommand } from './commands'

const AGENT_CHAT_REALTIME_CHANNEL_PREFIX = 'ai:handoff:agent-chat:'

@Injectable()
export class AgentChatRealtimeService implements OnModuleDestroy {
    readonly #logger = new Logger(AgentChatRealtimeService.name)
    readonly #subscribers = new Set<RedisClientType>()

    constructor(
        @Inject(REDIS_CLIENT)
        private readonly redis: RedisClientType,
        private readonly commandBus: CommandBus
    ) {}

    async onModuleDestroy() {
        await Promise.all(Array.from(this.#subscribers).map((client) => this.closeClient(client)))
        this.#subscribers.clear()
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
        return new Observable<MessageEvent>((subscriber) => {
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
                await this.closeClient(closing)
            }

            const complete = () => {
                if (settled) {
                    return
                }
                settled = true
                subscriber.complete()
                void close()
            }

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
        try {
            if (client.isOpen) {
                await client.quit()
            }
        } catch (error) {
            this.#logger.warn(`Failed to close agent chat realtime subscriber: ${this.getErrorMessage(error)}`)
        }
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
