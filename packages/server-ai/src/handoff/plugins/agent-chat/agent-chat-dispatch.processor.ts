import { runWithRequestContext as _runWithRequestContext } from '@metad/server-core'
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
} from '@xpert-ai/plugin-sdk'
import type { Observable } from 'rxjs'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { HandoffQueueService } from '../../message-queue.service'

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
		private readonly handoffQueueService: HandoffQueueService
	) {}

	async process(message: HandoffMessage<AgentChatDispatchPayload>, ctx: ProcessContext): Promise<ProcessResult> {
		const request = message.payload?.request
		const options = message.payload?.options
		const callback = message.payload?.callback

		if (!request) {
			return {
				status: 'dead',
				reason: 'Missing request in agent chat dispatch payload'
			}
		}
		if (!options?.xpertId) {
			return {
				status: 'dead',
				reason: 'Missing xpertId in agent chat dispatch payload'
			}
		}
		if (!callback?.messageType) {
			return {
				status: 'dead',
				reason: 'Missing callback.messageType in agent chat dispatch payload'
			}
		}

		this.logger.debug(`Processing agent chat dispatch message "${message.id}" with request:`, request, 'and options:', options)
		return this.runTaskWithRequestContext(message, async () => {
			const observable = await this.commandBus.execute<XpertChatCommand, Observable<MessageEvent>>(
				new XpertChatCommand(request, options)
			)
			await this.forwardStreamEvents(message, callback, observable, ctx)
			return { status: 'ok' }
		})
	}

	private async forwardStreamEvents(
		sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
		callback: AgentChatCallbackTarget,
		observable: Observable<MessageEvent>,
		ctx: ProcessContext
	): Promise<void> {
		let sequence = 1
		let settled = false
		let subscription: { unsubscribe: () => void } | undefined
		let chain: Promise<void> = Promise.resolve()

		const enqueueCallback = (
			payload: Pick<
				AgentChatCallbackEnvelopePayload,
				'kind' | 'sourceMessageId' | 'event' | 'error' | 'context'
			>
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
				})
					.finally(() => {
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
					this.logger.error(`Stream error for source message "${sourceMessage.id}": ${this.getErrorMessage(error)}`, error instanceof Error ? error.stack : undefined)
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

	private buildCallbackMessage(
		sourceMessage: HandoffMessage<AgentChatDispatchPayload>,
		callback: AgentChatCallbackTarget,
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
