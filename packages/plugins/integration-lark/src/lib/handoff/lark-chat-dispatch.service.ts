import {
	LanguagesEnum,
	TChatOptions
} from '@metad/contracts'
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import {
	AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
	HandoffMessage,
	HANDOFF_PERMISSION_SERVICE_TOKEN,
	HandoffPermissionService,
	PluginContext,
	RequestContext,
	AgentChatDispatchPayload
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { LarkConversationService } from '../conversation.service'
import { resolveConversationUserKey } from '../conversation-user-key'
import { ChatLarkMessage } from '../message'
import { LARK_PLUGIN_CONTEXT } from '../tokens'
import { LarkChatRunStateService } from './lark-chat-run-state.service'
import {
	LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
	LarkChatCallbackContext,
	LarkChatMessageSnapshot
} from './lark-chat.types'

export type TLarkChatDispatchInput = {
	xpertId: string
	input?: string
	larkMessage: ChatLarkMessage
	options?: {
		confirm?: boolean
		reject?: boolean
	}
}

/**
 * Builds and enqueues handoff messages for Lark chat requests.
 *
 * Responsibilities:
 * - Translate Lark-side input/message context into agent chat dispatch payloads.
 * - Persist stream/run callback state used by incremental UI updates.
 * - Update active message/session cache so follow-up actions can resume context.
 */
@Injectable()
export class LarkChatDispatchService {
	private readonly logger = new Logger(LarkChatDispatchService.name)
	private _handoffPermissionService: HandoffPermissionService

	constructor(
		@Inject(forwardRef(() => LarkConversationService))
		private readonly conversationService: LarkConversationService,
		private readonly runStateService: LarkChatRunStateService,
		@Inject(LARK_PLUGIN_CONTEXT)
		private readonly pluginContext: PluginContext
	) {}

	private get handoffPermissionService(): HandoffPermissionService {
		if (!this._handoffPermissionService) {
			this._handoffPermissionService = this.pluginContext.resolve(HANDOFF_PERMISSION_SERVICE_TOKEN)
		}
		return this._handoffPermissionService
	}

	async enqueueDispatch(input: TLarkChatDispatchInput): Promise<ChatLarkMessage> {
		const message = await this.buildDispatchMessage(input)
		await this.handoffPermissionService.enqueue(message, {
			delayMs: 0
		})
		return input.larkMessage
	}

	async buildDispatchMessage(input: TLarkChatDispatchInput): Promise<HandoffMessage<AgentChatDispatchPayload>> {
		const { xpertId, larkMessage } = input
		const requestUserId = RequestContext.currentUserId()
		const requestTenantId = RequestContext.currentTenantId()
		const requestOrganizationId = RequestContext.getOrganizationId()
		const conversationUserKey = resolveConversationUserKey({
			senderOpenId: larkMessage.senderOpenId,
			fallbackUserId: requestUserId
		})
		const conversationId = conversationUserKey
			? await this.conversationService.getConversation(conversationUserKey, xpertId)
			: undefined
		// Dispatch must run under xpert creator context; request context is only a safety fallback.
		const dispatchContext = await this.conversationService.resolveDispatchExecutionContext(
			xpertId,
			conversationUserKey
		)
		const tenantId = dispatchContext.tenantId ?? requestTenantId
		const organizationId = dispatchContext.organizationId ?? requestOrganizationId
		const executorUserId = dispatchContext.createdById ?? requestUserId
		if (!tenantId) {
			throw new Error('Missing tenantId in resolved dispatch context')
		}
		if (!executorUserId) {
			throw new Error('Missing executor userId in resolved dispatch context')
		}
		this.logger.debug(
			`Resolved Lark dispatch context: source=${dispatchContext.source}, xpertId=${xpertId}, conversationUserKey=${
				conversationUserKey ?? 'n/a'
			}, tenantId=${tenantId}, organizationId=${organizationId ?? 'n/a'}, executorUserId=${executorUserId}, requestUserId=${
				requestUserId ?? 'n/a'
			}`
		)

		await larkMessage.update({ status: 'thinking' })
		if (conversationUserKey) {
			await this.conversationService.setActiveMessage(
				conversationUserKey,
				xpertId,
				this.toActiveMessageCache(larkMessage)
			)
		}

		const runId = `lark-chat-${randomUUID()}`
		const sessionKey = conversationId ?? runId
		const language = larkMessage.language || RequestContext.getLanguageCode()
		const callbackContext: LarkChatCallbackContext = {
			tenantId,
			organizationId,
			userId: executorUserId,
			xpertId,
			integrationId: larkMessage.integrationId,
			chatId: larkMessage.chatId,
			senderOpenId: larkMessage.senderOpenId,
			reject: Boolean(input.options?.reject),
			streaming: this.resolveStreamingOverrideFromRequest(),
			message: this.toMessageSnapshot(larkMessage, input.input)
		}

		await this.runStateService.save({
			sourceMessageId: runId,
			nextSequence: 1,
			responseMessageContent: '',
			context: callbackContext,
			pendingEvents: {},
			lastFlushAt: 0,
			lastFlushedLength: 0,
			renderItems: (callbackContext.message?.elements ?? []).map((element) => ({
				kind: 'structured' as const,
				element: { ...element }
			}))
		})

		return {
			id: runId,
			type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
			version: 1,
			tenantId,
			sessionKey,
			businessKey: sessionKey,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: runId,
			payload: {
				request: {
					input: {
						input: input.input
					},
					conversationId,
					confirm: input.options?.confirm
				},
				options: {
					xpertId,
					from: 'feishu',
					// Keep the inbound Lark user as end-user identity for conversation attribution.
					fromEndUserId: requestUserId,
					tenantId,
					organizationId,
					// Force execution user to xpert creator (minimal shape is enough for downstream context).
					user: {
						id: executorUserId,
						tenantId
					},
					language: language as LanguagesEnum,
					channelType: 'lark',
					integrationId: larkMessage.integrationId,
					chatId: larkMessage.chatId,
					channelUserId: larkMessage.senderOpenId
				} as TChatOptions & { xpertId: string },
				callback: {
					messageType: LARK_CHAT_STREAM_CALLBACK_MESSAGE_TYPE,
					headers: {
						...(organizationId ? { organizationId } : {}),
						// Callback/user headers must use executor user so agent-chat runs in creator context.
						...(executorUserId ? { userId: executorUserId } : {}),
						...(language ? { language } : {}),
						...(conversationId ? { conversationId } : {}),
						source: 'lark',
						handoffQueue: 'integration',
						requestedLane: 'main',
						...(larkMessage.integrationId ? { integrationId: larkMessage.integrationId } : {})
					},
					context: callbackContext
				}
			} as AgentChatDispatchPayload,
			headers: {
				...(organizationId ? { organizationId } : {}),
				// Queue-level user header drives request context reconstruction in agent-chat processor.
				...(executorUserId ? { userId: executorUserId } : {}),
				...(language ? { language } : {}),
				...(conversationId ? { conversationId } : {}),
				source: 'lark',
				requestedLane: 'main',
				handoffQueue: 'realtime',
				...(larkMessage.integrationId ? { integrationId: larkMessage.integrationId } : {})
			}
		}
	}

	private toMessageSnapshot(message: ChatLarkMessage, text?: string): LarkChatMessageSnapshot {
		return {
			id: message.id,
			messageId: message.messageId,
			status: message.status,
			language: message.language,
			header: message.header,
			elements: [...(message.elements ?? [])],
			text
		}
	}

	private toActiveMessageCache(message: ChatLarkMessage) {
		return {
			id: message.messageId,
			thirdPartyMessage: {
				id: message.id,
				messageId: message.messageId,
				status: message.status as string,
				language: message.language,
				header: message.header,
				elements: [...(message.elements ?? [])]
			}
		}
	}

	private resolveStreamingOverrideFromRequest(): LarkChatCallbackContext['streaming'] | undefined {
		const request = RequestContext.currentRequest()
		const rawHeader =
			request?.headers?.['x-lark-stream-update-window-ms'] ??
			request?.headers?.['lark-stream-update-window-ms']
		const rawValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
		if (!rawValue) {
			return undefined
		}
		const parsed = parseInt(String(rawValue), 10)
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return undefined
		}
		return {
			updateWindowMs: parsed
		}
	}
}
