import { runWithRequestContext as _runWithRequestContext } from '@xpert-ai/server-core'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { ApiKeyBindingType, IApiKey, IApiPrincipal, IUser, RequestScopeLevel, UserType } from '@xpert-ai/contracts'
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
import { XpertPrincipalService, XpertPrincipalTarget } from '../../../xpert/xpert-principal.service'
import { HandoffQueueService } from '../../message-queue.service'
import { AgentChatRealtimeService } from '../../agent-chat-realtime.service'
import { normalizeChatSourceAuditOptions } from '../../../shared/agent/source-audit'

type RuntimeRequestContext = {
    user?: IApiPrincipal | { id: string; tenantId: string }
    headers: Record<string, string>
}

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
        private readonly agentChatRealtime: AgentChatRealtimeService,
        @Optional()
        private readonly moduleRef?: ModuleRef
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
                const chatOptions = normalizeChatSourceAuditOptions({
                    options: message.payload.options,
                    headers: message.headers,
                    callbackContext: message.payload.callback?.context,
                    messageId: message.id,
                    traceId: message.traceId,
                    parentMessageId: message.parentMessageId
                })
                const observable = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
                    new XpertChatCommand(request, chatOptions)
                )
                if (this.isRedisPubSubCallback(callback)) {
                    await this.forwardRealtimeEvents(message, callback, observable, ctx)
                } else {
                    await this.forwardStreamEvents(message, callback, observable, ctx)
                }
                return { status: 'ok' }
            })
        } catch (error) {
            const reason = this.getErrorMessage(error)
            if (this.isRedisPubSubCallback(callback)) {
                return this.deadResult(message, callback, reason)
            }
            if (this.isHandoffMessageCallback(callback)) {
                await this.enqueueCallbackError(message, callback, reason)
                return {
                    status: 'dead',
                    reason
                }
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

    private async enqueueCallbackError(
        sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
        callback: AgentChatHandoffMessageCallbackTarget,
        error: string
    ) {
        await this.handoffQueueService.enqueue(
            this.buildCallbackMessage(sourceMessage, callback, {
                kind: 'error',
                sourceMessageId: sourceMessage.id,
                sequence: 1,
                error,
                context: callback.context
            })
        )
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
        const runtimeContext = await this.resolveRuntimeRequestContext(message)
        if (runtimeContext) {
            return this.withRequestContext(runtimeContext, task)
        }

        return task()
    }

    private async resolveRuntimeRequestContext(
        message: HandoffMessage<AgentChatDispatchPayload>
    ): Promise<RuntimeRequestContext | null> {
        const runtimePrincipal = message.payload?.options?.runtimePrincipal as
            | { type?: unknown; xpertId?: unknown }
            | undefined
        if (runtimePrincipal) {
            if (runtimePrincipal.type !== 'assistant') {
                throw new Error(`Unsupported agent chat runtime principal: ${String(runtimePrincipal.type)}`)
            }
            return this.resolveAssistantRuntimeContext(message)
        }

        const userId = this.toNonEmptyString(message.headers?.userId)
        const organizationId = this.toNonEmptyString(message.headers?.organizationId)
        const language = this.toNonEmptyString(message.headers?.language)
        if (!userId && !organizationId && !language) {
            return null
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

        return {
            user,
            headers
        }
    }

    private async resolveAssistantRuntimeContext(
        message: HandoffMessage<AgentChatDispatchPayload>
    ): Promise<RuntimeRequestContext> {
        const payloadXpertId = this.toNonEmptyString(message.payload?.options?.xpertId)
        const runtimePrincipal = message.payload?.options?.runtimePrincipal as { xpertId?: unknown } | undefined
        const principalXpertId = this.toNonEmptyString(runtimePrincipal?.xpertId) ?? payloadXpertId
        if (!principalXpertId) {
            throw new Error('Missing xpertId for assistant runtime principal')
        }
        if (payloadXpertId && principalXpertId !== payloadXpertId) {
            throw new Error('Assistant runtime principal xpertId must match dispatch xpertId')
        }

        const principalService = this.resolveXpertPrincipalService()
        if (!principalService) {
            throw new Error('Xpert principal service is not available for assistant runtime principal')
        }

        const { xpert, user } = await principalService.ensurePrincipalUserByXpertId({
            xpertId: principalXpertId,
            tenantId: message.tenantId
        })
        const tenantId = this.toNonEmptyString(xpert.tenantId) ?? message.tenantId
        if (tenantId !== message.tenantId) {
            throw new Error('Assistant runtime principal tenantId must match handoff message tenantId')
        }

        const organizationId = this.toNonEmptyString(xpert.organizationId)
        const language =
            this.toNonEmptyString(message.headers?.language) ?? this.toNonEmptyString(user.preferredLanguage)
        const headers: Record<string, string> = {
            ['tenant-id']: tenantId,
            ['x-scope-level']: organizationId ? RequestScopeLevel.ORGANIZATION : RequestScopeLevel.TENANT,
            ...(organizationId ? { ['organization-id']: organizationId } : {}),
            ...(language ? { language } : {})
        }

        return {
            user: this.buildAssistantApiPrincipal({
                xpertId: principalXpertId,
                xpert,
                user,
                tenantId,
                organizationId
            }),
            headers
        }
    }

    private buildAssistantApiPrincipal(input: {
        xpertId: string
        xpert: XpertPrincipalTarget
        user: IUser
        tenantId: string
        organizationId?: string
    }): IApiPrincipal {
        const apiKey: IApiKey = {
            token: `internal:assistant-runtime:${input.xpertId}`,
            name: `assistant-runtime:${input.xpertId}`,
            type: ApiKeyBindingType.ASSISTANT,
            entityId: input.xpertId,
            tenantId: input.tenantId,
            organizationId: input.organizationId ?? null,
            createdById: input.xpert.createdById ?? undefined,
            userId: input.user.id,
            user: input.user
        }

        return {
            ...input.user,
            id: input.user.id,
            tenantId: input.tenantId,
            type: input.user.type ?? UserType.COMMUNICATION,
            apiKey,
            ownerUserId: input.xpert.createdById ?? null,
            apiKeyUserId: input.user.id,
            requestedUserId: null,
            requestedOrganizationId: input.organizationId ?? null,
            principalType: 'api_key'
        }
    }

    private resolveXpertPrincipalService(): XpertPrincipalService | null {
        try {
            return this.moduleRef?.get(XpertPrincipalService, { strict: false }) ?? null
        } catch {
            return null
        }
    }

    private async withRequestContext(
        context: RuntimeRequestContext,
        task: () => Promise<ProcessResult>
    ): Promise<ProcessResult> {
        return new Promise<ProcessResult>((resolve, reject) => {
            runWithRequestContext(
                {
                    user: context.user,
                    headers: context.headers
                },
                {},
                () => {
                    _runWithRequestContext(
                        {
                            user: context.user,
                            headers: context.headers
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

    private isHandoffMessageCallback(
        callback: AgentChatCallbackTarget | undefined
    ): callback is AgentChatHandoffMessageCallbackTarget {
        return (
            !!callback && callback.transport !== 'redis-pubsub' && 'messageType' in callback && !!callback.messageType
        )
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
