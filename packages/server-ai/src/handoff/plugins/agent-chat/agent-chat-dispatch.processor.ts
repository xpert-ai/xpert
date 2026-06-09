import { runWithRequestContext as _runWithRequestContext } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    HandoffMessage,
    HandoffProcessorStrategy,
    IHandoffProcessor,
    ProcessContext,
    ProcessResult,
    runWithRequestContext,
    AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
    AgentChatCallbackEnvelopePayload,
    AgentChatCallbackTarget,
    AgentChatDispatchPayload,
    AgentChatHandoffMessageCallbackTarget
} from '@xpert-ai/plugin-sdk'
import type { Observable } from 'rxjs'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { HandoffQueueService } from '../../message-queue.service'
import { AgentChatRealtimeService } from '../../agent-chat-realtime.service'

@Injectable()
@HandoffProcessorStrategy(AGENT_CHAT_DISPATCH_MESSAGE_TYPE, {
    types: [AGENT_CHAT_DISPATCH_MESSAGE_TYPE],
    policy: {
        lane: 'main'
    }
})
export class AgentChatDispatchHandoffProcessor implements IHandoffProcessor<AgentChatDispatchPayload> {
    private readonly logger = new Logger(AgentChatDispatchHandoffProcessor.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly handoffQueueService: HandoffQueueService,
        private readonly agentChatRealtime: AgentChatRealtimeService
    ) {}

    async process(message: HandoffMessage<AgentChatDispatchPayload>, ctx: ProcessContext): Promise<ProcessResult> {
        const request = message.payload?.request
        const options = message.payload?.options
        const callback = message.payload?.callback

        if (!request) {
            return this.deadResult(message, callback, 'Missing request in agent chat dispatch payload')
        }
        if (!options?.xpertId) {
            return this.deadResult(message, callback, 'Missing xpertId in agent chat dispatch payload')
        }
        if (!this.isRedisPubSubCallback(callback) && !callback?.messageType) {
            return this.deadResult(message, callback, 'Missing callback.messageType in agent chat dispatch payload')
        }
        if (request.action === 'send' && !request.message?.input) {
            return this.deadResult(
                message,
                callback,
                'Invalid send request in agent chat dispatch payload: message.input is required'
            )
        }

        this.logger.debug(
            `Processing agent chat dispatch message "${message.id}" with request:`,
            request,
            'and options:',
            options
        )
        try {
            return await this.runTaskWithRequestContext(message, async () => {
                const observable = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
                    new XpertChatCommand(request, options)
                )
                if (this.isRedisPubSubCallback(callback)) {
                    await this.forwardRealtimeEvents(message, callback, observable, ctx)
                } else {
                    await this.forwardStreamEvents(message, callback, observable, ctx)
                }
                return { status: 'ok' }
            })
        } catch (error) {
            if (this.isRedisPubSubCallback(callback)) {
                return this.deadResult(message, callback, this.getErrorMessage(error))
            }
            throw error
        }
    }

    private async deadResult(
        sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
        callback: AgentChatCallbackTarget | undefined,
        reason: string
    ): Promise<ProcessResult> {
        if (this.isRedisPubSubCallback(callback)) {
            await this.publishRealtimeError(sourceMessage, callback, reason)
        }

        return {
            status: 'dead',
            reason
        }
    }

    private async publishRealtimeError(
        sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
        callback: Extract<AgentChatCallbackTarget, { transport: 'redis-pubsub' }>,
        error: string
    ) {
        await this.agentChatRealtime.publish(sourceMessage.id, {
            kind: 'error',
            sourceMessageId: sourceMessage.id,
            sequence: 1,
            error,
            context: callback.context
        })
    }

    private async forwardStreamEvents(
        sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
        callback: AgentChatHandoffMessageCallbackTarget,
        observable: Observable<MessageEvent>,
        ctx: ProcessContext
    ): Promise<void> {
        let sequence = 1
        let settled = false
        let subscription: { unsubscribe: () => void } | undefined
        let chain: Promise<void> = Promise.resolve()

        const enqueueCallback = (
            payload: Pick<AgentChatCallbackEnvelopePayload, 'kind' | 'sourceMessageId' | 'event' | 'error' | 'context'>
        ) => {
            const nextPayload: AgentChatCallbackEnvelopePayload = {
                ...payload,
                sequence
            }
            sequence += 1
            chain = chain.then(() =>
                this.handoffQueueService
                    .enqueue(this.buildCallbackMessage(sourceMessage, callback, nextPayload))
                    .then(() => undefined)
            )
            return chain
        }

        return new Promise<void>((resolve, reject) => {
            const finish = (handler: () => void) => {
                if (settled) {
                    return
                }
                settled = true
                ctx.abortSignal.removeEventListener('abort', onAbort)
                subscription?.unsubscribe()
                handler()
            }

            const onAbort = () => {
                enqueueCallback({
                    kind: 'error',
                    sourceMessageId: sourceMessage.id,
                    error: 'Agent chat dispatch aborted',
                    context: callback.context
                }).finally(() => {
                    finish(() => resolve())
                })
            }

            ctx.abortSignal.addEventListener('abort', onAbort, { once: true })

            subscription = observable.subscribe({
                next: (event) => {
                    // this.logger.debug(`Received stream event for source message "${sourceMessage.id}"`, event)
                    enqueueCallback({
                        kind: 'stream',
                        sourceMessageId: sourceMessage.id,
                        event,
                        context: callback.context
                    }).catch((error) => {
                        finish(() => reject(error))
                    })
                },
                error: (error) => {
                    this.logger.error(
                        `Stream error for source message "${sourceMessage.id}": ${this.getErrorMessage(error)}`,
                        error instanceof Error ? error.stack : undefined
                    )
                    enqueueCallback({
                        kind: 'error',
                        sourceMessageId: sourceMessage.id,
                        error: this.getErrorMessage(error),
                        context: callback.context
                    })
                        .then(() => {
                            finish(() => resolve())
                        })
                        .catch((enqueueError) => {
                            finish(() => reject(enqueueError))
                        })
                },
                complete: () => {
                    this.logger.debug(`Stream completed for source message "${sourceMessage.id}"`)
                    enqueueCallback({
                        kind: 'complete',
                        sourceMessageId: sourceMessage.id,
                        context: callback.context
                    })
                        .then(() => {
                            finish(() => resolve())
                        })
                        .catch((error) => {
                            finish(() => reject(error))
                        })
                }
            })
        })
    }

    private async forwardRealtimeEvents(
        sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
        callback: AgentChatCallbackTarget,
        observable: Observable<MessageEvent>,
        ctx: ProcessContext
    ): Promise<void> {
        let sequence = 1
        let settled = false
        let subscription: { unsubscribe: () => void } | undefined
        let chain: Promise<void> = Promise.resolve()

        const publish = (
            payload: Pick<AgentChatCallbackEnvelopePayload, 'kind' | 'sourceMessageId' | 'event' | 'error' | 'context'>
        ) => {
            const nextPayload: AgentChatCallbackEnvelopePayload = {
                ...payload,
                sequence
            }
            sequence += 1
            chain = chain.then(() => this.agentChatRealtime.publish(sourceMessage.id, nextPayload))
            return chain
        }

        return new Promise<void>((resolve, reject) => {
            const finish = (handler: () => void) => {
                if (settled) {
                    return
                }
                settled = true
                ctx.abortSignal.removeEventListener('abort', onAbort)
                subscription?.unsubscribe()
                handler()
            }

            const onAbort = () => {
                publish({
                    kind: 'error',
                    sourceMessageId: sourceMessage.id,
                    error: 'Agent chat dispatch aborted',
                    context: callback.context
                }).finally(() => {
                    finish(() => resolve())
                })
            }

            ctx.abortSignal.addEventListener('abort', onAbort, { once: true })

            subscription = observable.subscribe({
                next: (event) => {
                    publish({
                        kind: 'stream',
                        sourceMessageId: sourceMessage.id,
                        event,
                        context: callback.context
                    }).catch((error) => {
                        finish(() => reject(error))
                    })
                },
                error: (error) => {
                    this.logger.error(
                        `Realtime stream error for source message "${sourceMessage.id}": ${this.getErrorMessage(error)}`,
                        error instanceof Error ? error.stack : undefined
                    )
                    publish({
                        kind: 'error',
                        sourceMessageId: sourceMessage.id,
                        error: this.getErrorMessage(error),
                        context: callback.context
                    })
                        .then(() => {
                            finish(() => resolve())
                        })
                        .catch((publishError) => {
                            finish(() => reject(publishError))
                        })
                },
                complete: () => {
                    this.logger.debug(`Realtime stream completed for source message "${sourceMessage.id}"`)
                    publish({
                        kind: 'complete',
                        sourceMessageId: sourceMessage.id,
                        context: callback.context
                    })
                        .then(() => {
                            finish(() => resolve())
                        })
                        .catch((error) => {
                            finish(() => reject(error))
                        })
                }
            })
        })
    }

    private buildCallbackMessage(
        sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
        callback: AgentChatHandoffMessageCallbackTarget,
        payload: AgentChatCallbackEnvelopePayload
    ): HandoffMessage<AgentChatCallbackEnvelopePayload> {
        const now = Date.now()
        const messageId = `${sourceMessage.id}:callback:${payload.sequence}`
        return {
            id: messageId,
            type: callback.messageType,
            version: 1,
            tenantId: sourceMessage.tenantId,
            sessionKey: sourceMessage.sessionKey,
            businessKey: sourceMessage.businessKey,
            attempt: 1,
            maxAttempts: sourceMessage.maxAttempts ?? 1,
            enqueuedAt: now,
            traceId: sourceMessage.traceId,
            parentMessageId: sourceMessage.id,
            payload,
            headers: {
                ...(sourceMessage.headers ?? {}),
                ...(callback.headers ?? {})
            }
        }
    }

    private async runTaskWithRequestContext(
        message: HandoffMessage<AgentChatDispatchPayload>,
        task: () => Promise<ProcessResult>
    ): Promise<ProcessResult> {
        const userId = this.toNonEmptyString(message.headers?.userId)
        const organizationId = this.toNonEmptyString(message.headers?.organizationId)
        const language = this.toNonEmptyString(message.headers?.language)
        if (!userId && !organizationId && !language) {
            return task()
        }

        const headers: Record<string, string> = {
            ['tenant-id']: message.tenantId,
            ...(organizationId ? { ['organization-id']: organizationId } : {}),
            ...(language ? { language } : {})
        }
        const user = userId
            ? {
                  id: userId,
                  tenantId: message.tenantId
              }
            : undefined

        return new Promise<ProcessResult>((resolve, reject) => {
            runWithRequestContext(
                {
                    user,
                    headers
                },
                {},
                () => {
                    _runWithRequestContext(
                        {
                            user,
                            headers
                        },
                        () => {
                            task().then(resolve).catch(reject)
                        }
                    )
                }
            )
        })
    }

    private toNonEmptyString(value: unknown): string | undefined {
        return typeof value === 'string' && value.length > 0 ? value : undefined
    }

    private isRedisPubSubCallback(
        callback: AgentChatCallbackTarget | undefined
    ): callback is Extract<AgentChatCallbackTarget, { transport: 'redis-pubsub' }> {
        return callback?.transport === 'redis-pubsub'
    }

    private getErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message
        }
        if (typeof error === 'string') {
            return error
        }
        return 'Unknown agent chat dispatch error'
    }
}
