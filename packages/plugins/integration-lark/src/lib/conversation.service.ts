import { mapTranslationLanguage, TIntegrationLarkOptions } from '@metad/contracts'
import {
	RequestContext,
	runWithRequestContext,
	TChatInboundMessage,
	TChatCardAction,
	TChatEventContext
} from '@xpert-ai/plugin-sdk'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ChatLarkMessage } from './chat/message'
import { LarkMessageCommand } from './commands'
import { LarkChatXpertCommand } from './commands/chat-xpert.command'
import { LarkService } from './lark.service'
import { ChatLarkContext, isConfirmAction, isEndAction, isRejectAction } from './types'
import { LarkCoreApi } from './lark-core-api.service'
import { LarkExecutionQueueService } from './lark-execution-queue.service'
import { LarkChannelRuntimeManager } from './lark-channel-runtime.manager'
import {
	ChatLarkContextPayload,
	LarkHandoffMessageTask,
	LarkHandoffTask,
	LarkHandoffXpertTask,
	SerializedLarkMessage
} from './lark-handoff.types'

@Injectable()
export class LarkConversationService {
	private readonly logger = new Logger(LarkConversationService.name)

	public static readonly prefix = 'lark:chat'

	constructor(
		private readonly core: LarkCoreApi,
		private readonly commandBus: CommandBus,
		@Inject(forwardRef(() => LarkService))
		private readonly larkService: LarkService,
		private readonly executionQueue: LarkExecutionQueueService,
		private readonly channelRuntimeManager: LarkChannelRuntimeManager
	) {}

	async getConversation(userId: string, xpertId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		return await this.core.cache.get<string>(key)
	}

	async setConversation(userId: string, xpertId: string, conversationId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		await this.core.cache.set(key, conversationId, 60 * 10 * 1000) // 10 min conversation live
		await this.core.cache.get<string>(key)
	}

	async clearConversation(userId: string, xpertId: string) {
		const key = LarkConversationService.prefix + `:${userId}:${xpertId}`
		await this.core.cache.del(key)
	}

	async ask(xpertId: string, content: string, message: ChatLarkMessage) {
		await this.commandBus.execute(new LarkChatXpertCommand(xpertId, content, message))
	}

	/**
	 * Get last message of user's conversation.
	 *
	 * @param userId
	 * @param xpertId
	 * @returns
	 */
	async getLastMessage(userId: string, xpertId: string) {
		const id = await this.getConversation(userId, xpertId)
		if (id) {
			const conversation = await this.core.chat.getChatConversation(id, ['messages'])
			return conversation?.messages?.slice(-1)[0] ?? null
		}
		return null
	}

	async onAction(
		action: string,
		chatContext: ChatLarkContext,
		userId: string,
		xpertId: string,
		runtimeContext: {
			accountId: string
			accountKey: string
			sessionKey: string
			user: any
			language?: string
		}
	) {
		const id = await this.getConversation(userId, xpertId)

		if (!id) {
			const { integrationId, chatId } = chatContext

			return this.larkService.errorMessage(
				{ integrationId, chatId },
				new Error(
					await this.larkService.translate('integration.Lark.ActionSessionTimedOut', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
			)
		}

		const lastMessage = await this.getLastMessage(userId, xpertId)

		const prevMessage = new ChatLarkMessage(
			{ ...chatContext, larkService: this.larkService },
			{ ...(lastMessage?.thirdPartyMessage ?? {}), messageId: lastMessage.id } as any
		)

		const newMessage = new ChatLarkMessage(
			{ ...chatContext, larkService: this.larkService },
			{
				language: lastMessage?.thirdPartyMessage?.language
			} as any
		)

		if (isEndAction(action)) {
			await prevMessage.end()
			await this.core.cache.del(LarkConversationService.prefix + `:${userId}:${xpertId}`)
		} else if (isConfirmAction(action)) {
			await prevMessage.done()
			await this.enqueueXpertTask({
				accountId: runtimeContext.accountId,
				accountKey: runtimeContext.accountKey,
				sessionKey: runtimeContext.sessionKey,
				tenantId: this.resolveTenantId(chatContext.tenant, runtimeContext.user),
				user: runtimeContext.user,
				organizationId: chatContext.organizationId,
				language: runtimeContext.language,
				integrationId: chatContext.integrationId,
				xpertId,
				input: null,
				larkMessage: this.serializeLarkMessage(chatContext, newMessage),
				options: {
					confirm: true
				}
			})
		} else if (isRejectAction(action)) {
			await prevMessage.done()
			await this.enqueueXpertTask({
				accountId: runtimeContext.accountId,
				accountKey: runtimeContext.accountKey,
				sessionKey: runtimeContext.sessionKey,
				tenantId: this.resolveTenantId(chatContext.tenant, runtimeContext.user),
				user: runtimeContext.user,
				organizationId: chatContext.organizationId,
				language: runtimeContext.language,
				integrationId: chatContext.integrationId,
				xpertId,
				input: null,
				larkMessage: this.serializeLarkMessage(chatContext, newMessage),
				options: {
					reject: true
				}
			})
		} else {
			await this.enqueueMessageTask({
				accountId: runtimeContext.accountId,
				accountKey: runtimeContext.accountKey,
				sessionKey: runtimeContext.sessionKey,
				tenantId: this.resolveTenantId(chatContext.tenant, runtimeContext.user),
				user: runtimeContext.user,
				organizationId: chatContext.organizationId,
				language: runtimeContext.language,
				payload: {
					...chatContext,
					input: action
				}
			})
		}
	}

	/**
	 * Handle inbound message from IChatChannel
	 *
	 * This method is called by LarkHooksController when a message is received via webhook.
	 * It enqueues handoff messages to the core dispatcher queue.
	 *
	 * @param message - Parsed inbound message
	 * @param ctx - Event context containing integration info
	 */
	async handleMessage(
		message: TChatInboundMessage,
		ctx: TChatEventContext<TIntegrationLarkOptions>
	): Promise<void> {
		const user = RequestContext.currentUser()
		if (!user) {
			this.logger.warn('No user in request context, cannot handle message')
			return
		}

		const accountId = this.resolveAccountId(ctx.integration.id, ctx.integration.options)
		const accountKey = this.channelRuntimeManager.buildAccountKey(
			'lark',
			ctx.integration.id,
			accountId
		)

		if (!this.channelRuntimeManager.isAccountRunning('lark', ctx.integration.id, accountId)) {
			this.logger.warn(
				`Skip inbound Lark message for stopped account: integration=${ctx.integration.id}, account=${accountId}`
			)
			return
		}

		const sessionKey = this.resolveSessionKey({
			integrationId: ctx.integration.id,
			chatId: message.chatId,
			senderOpenId: message.senderId,
			userId: user.id
		})

		await this.enqueueMessageTask({
			accountId,
			accountKey,
			sessionKey,
			tenantId: ctx.tenantId,
			user,
			organizationId: ctx.organizationId,
			language: ctx.integration.options?.preferLanguage || user.preferredLanguage,
			payload: {
				tenant: ctx.integration.tenant,
				organizationId: ctx.organizationId,
				integrationId: ctx.integration.id,
				userId: user.id,
				message: message.raw,
				chatId: message.chatId,
				chatType: message.chatType,
				senderOpenId: message.senderId // Lark sender's open_id
			}
		})
	}

	/**
	 * Handle card action from IChatChannel
	 *
	 * This method is called by LarkHooksController when a card button is clicked.
	 *
	 * @param action - Parsed card action
	 * @param ctx - Event context containing integration info
	 */
	async handleCardAction(
		action: TChatCardAction,
		ctx: TChatEventContext<TIntegrationLarkOptions>
	): Promise<void> {
		const { xpertId } = ctx.integration.options ?? {}
		if (!xpertId) {
			this.logger.warn('No xpertId configured for integration')
			return
		}

		const user = RequestContext.currentUser()
		if (!user) {
			this.logger.warn('No user in request context, cannot handle card action')
			return
		}

		const accountId = this.resolveAccountId(ctx.integration.id, ctx.integration.options)
		const accountKey = this.channelRuntimeManager.buildAccountKey(
			'lark',
			ctx.integration.id,
			accountId
		)

		if (!this.channelRuntimeManager.isAccountRunning('lark', ctx.integration.id, accountId)) {
			this.logger.warn(
				`Skip card action for stopped account: integration=${ctx.integration.id}, account=${accountId}`
			)
			return
		}

		const sessionKey = this.resolveSessionKey({
			integrationId: ctx.integration.id,
			chatId: action.chatId,
			senderOpenId: action.userId,
			userId: user.id
		})

		await this.onAction(
			action.value,
			{
				tenant: ctx.integration.tenant,
				organizationId: ctx.organizationId,
				integrationId: ctx.integration.id,
				userId: user.id,
				chatId: action.chatId,
				senderOpenId: action.userId
			} as ChatLarkContext,
			user.id,
			xpertId,
			{
				accountId,
				accountKey,
				sessionKey,
				user,
				language: ctx.integration.options?.preferLanguage || user.preferredLanguage
			}
		)
	}

	async processQueuedTask(
		task: LarkHandoffTask,
		runtime?: { runId: string; abortSignal: AbortSignal }
	): Promise<void> {
		if (task.kind === 'message') {
			await this.executeMessageTask(task, runtime)
			return
		}

		await this.executeXpertTask(task, runtime)
	}

	private resolveAccountId(integrationId: string, options?: TIntegrationLarkOptions): string {
		// integrationId is stable across credential rotation (appId/appSecret updates).
		return integrationId || options?.appId || 'default'
	}

	private resolveSessionKey(params: {
		integrationId: string
		chatId?: string
		senderOpenId?: string
		userId?: string
	}): string {
		const chatId = params.chatId || 'unknown-chat'
		const participant = params.senderOpenId || params.userId || 'unknown-user'
		return `channel:lark:integration:${params.integrationId}:chat:${chatId}:user:${participant}`
	}

	private resolveTenantId(tenant: any, user: any): string {
		return (
			tenant?.id ||
			tenant?.tenantId ||
			user?.tenantId ||
			RequestContext.currentTenantId()
		)
	}

	private runInRequestContext<T>(
		params: {
			user: any
			tenantId?: string
			organizationId: string
			language?: string
		},
		task: () => Promise<T>
	): Promise<T> {
		const headers: Record<string, string> = {
			['organization-id']: params.organizationId
		}
		if (params.tenantId) {
			headers['tenant-id'] = params.tenantId
		}
		if (params.language) {
			headers['language'] = params.language
		}

		return new Promise<T>((resolve, reject) => {
			runWithRequestContext(
				{
					user: this.withTenantUser(params.user, params.tenantId),
					headers
				},
				{},
				() => {
					task().then(resolve).catch(reject)
				}
			)
		})
	}

	private async enqueueMessageTask(params: {
		accountId: string
		accountKey: string
		sessionKey: string
		tenantId: string
		organizationId: string
		language?: string
		user: any
		payload: ChatLarkContext
	}): Promise<void> {
		if (!this.channelRuntimeManager.isAccountRunning('lark', params.payload.integrationId, params.accountId)) {
			this.logger.warn(
				`Skip Lark message enqueue for stopped account: integration=${params.payload.integrationId}, account=${params.accountId}`
			)
			return
		}

		const task: LarkHandoffMessageTask = {
			kind: 'message',
			tenantId: params.tenantId,
			integrationId: params.payload.integrationId,
			accountId: params.accountId,
			accountKey: params.accountKey,
			sessionKey: params.sessionKey,
			organizationId: params.organizationId,
			language: params.language,
			user: this.withTenantUser(params.user, params.tenantId),
			payload: params.payload
		}
		await this.executionQueue.enqueueMessageTask(task)
	}

	private async enqueueXpertTask(params: {
		accountId: string
		accountKey: string
		sessionKey: string
		tenantId: string
		integrationId: string
		organizationId: string
		language?: string
		user: any
		xpertId: string
		input: string | null
		larkMessage: SerializedLarkMessage
		options?: {
			confirm?: boolean
			reject?: boolean
		}
	}): Promise<void> {
		if (
			!this.channelRuntimeManager.isAccountRunning(
				'lark',
				params.integrationId,
				params.accountId
			)
		) {
			this.logger.warn(
				`Skip Lark xpert enqueue for stopped account: integration=${params.integrationId}, account=${params.accountId}`
			)
			return
		}

		const task: LarkHandoffXpertTask = {
			kind: 'xpert',
			tenantId: params.tenantId,
			integrationId: params.integrationId,
			accountId: params.accountId,
			accountKey: params.accountKey,
			sessionKey: params.sessionKey,
			organizationId: params.organizationId,
			language: params.language,
			user: this.withTenantUser(params.user, params.tenantId),
			xpertId: params.xpertId,
			input: params.input,
			larkMessage: params.larkMessage,
			options: params.options
		}
		await this.executionQueue.enqueueXpertTask(task)
	}

	private serializeLarkMessage(
		chatContext: ChatLarkContext,
		message: ChatLarkMessage
	): SerializedLarkMessage {
		const context: ChatLarkContextPayload = {
			tenant: chatContext.tenant,
			organizationId: chatContext.organizationId,
			integrationId: chatContext.integrationId,
			userId: chatContext.userId,
			chatId: chatContext.chatId,
			chatType: chatContext.chatType,
			senderOpenId: chatContext.senderOpenId
		}

		return {
			context,
			fields: {
				id: message.id,
				messageId: message.messageId,
				status: message.status,
				language: message.language,
				header: message.header,
				elements: message.elements
			}
		}
	}

	private async executeMessageTask(
		task: LarkHandoffMessageTask,
		runtime?: { runId: string; abortSignal: AbortSignal }
	): Promise<void> {
		await this.runInRequestContext(
			{
				user: task.user,
				tenantId: task.tenantId,
				organizationId: task.organizationId,
				language: task.language
			},
			async () => {
				await this.commandBus.execute(
					new LarkMessageCommand({
						...task.payload,
						abortSignal: runtime?.abortSignal,
						runtimeRunId: runtime?.runId,
						runtimeSessionKey: task.sessionKey
					})
				)
			}
		)
	}

	private async executeXpertTask(
		task: LarkHandoffXpertTask,
		runtime?: { runId: string; abortSignal: AbortSignal }
	): Promise<void> {
		const larkMessage = new ChatLarkMessage(
			{
				...task.larkMessage.context,
				larkService: this.larkService
			},
			task.larkMessage.fields
		)

		await this.runInRequestContext(
			{
				user: task.user,
				tenantId: task.tenantId,
				organizationId: task.organizationId,
				language: task.language
			},
			async () => {
				await this.commandBus.execute(
					new LarkChatXpertCommand(task.xpertId, task.input, larkMessage, {
						...(task.options || {}),
						abortSignal: runtime?.abortSignal
					})
				)
			}
		)
	}

	private withTenantUser(user: any, tenantId?: string): any {
		if (!user) {
			return user
		}
		if (user.tenantId || !tenantId) {
			return user
		}
		return {
			...user,
			tenantId
		}
	}
}
