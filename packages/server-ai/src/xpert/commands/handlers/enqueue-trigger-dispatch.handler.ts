import { STATE_VARIABLE_HUMAN, TChatFrom } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { UserService } from '@metad/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
	AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
	HandoffMessage,
	RunSource,
	AgentChatDispatchPayload
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'crypto'
import { HandoffQueueService } from '../../../handoff/message-queue.service'
import { AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE } from '../../../handoff/plugins/agent-chat/agent-chat-callback-noop.processor'
import { XpertService } from '../../xpert.service'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'

const ALLOWED_CHAT_FROM = new Set<string>([
	'platform',
	'webapp',
	'debugger',
	'knowledge',
	'job',
	'api',
	'feishu',
	'lark',
	'dingtalk',
	'wecom'
])

@Injectable()
@CommandHandler(XpertEnqueueTriggerDispatchCommand)
export class XpertEnqueueTriggerDispatchHandler implements ICommandHandler<XpertEnqueueTriggerDispatchCommand> {
	readonly #logger = new Logger(XpertEnqueueTriggerDispatchHandler.name)

	constructor(
		private readonly xpertService: XpertService,
		private readonly userService: UserService,
		private readonly handoffQueue: HandoffQueueService
	) {}

	async execute(command: XpertEnqueueTriggerDispatchCommand): Promise<void> {
		const { xpertId, userId, state, params } = command
		const xpert = await this.xpertService.findOne(xpertId)
		if (!xpert) {
			throw new NotFoundException(`Xpert "${xpertId}" not found`)
		}
		if (!xpert.tenantId) {
			throw new Error(`Missing tenantId for xpert "${xpertId}"`)
		}

		const resolvedUserId = userId || xpert.createdById
		let language: string | undefined
		if (resolvedUserId) {
			try {
				const user = await this.userService.findOne(resolvedUserId)
				language = user?.preferredLanguage
			} catch (error) {
				this.#logger.warn(
					`Load trigger user "${resolvedUserId}" failed for xpert "${xpertId}": ${getErrorMessage(error)}`
				)
			}
		}

		const from = this.normalizeChatFrom(params.from)
		const source = this.toRunSource(from)
		const runId = `xpert-trigger-${randomUUID()}`
		const sessionKey = params.executionId ?? `${xpertId}:trigger:${runId}`
		const input = this.normalizeHumanInput(state)
		const message: HandoffMessage<AgentChatDispatchPayload> = {
			id: runId,
			type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
			version: 1,
			tenantId: xpert.tenantId,
			sessionKey,
			businessKey: sessionKey,
			attempt: 1,
			maxAttempts: 1,
			enqueuedAt: Date.now(),
			traceId: runId,
			payload: {
				request: {
					input,
					state
				},
				options: {
					xpertId,
					from,
					...(params.isDraft ? { isDraft: true } : {}),
					...(params.executionId ? { execution: { id: params.executionId } } : {})
				} as AgentChatDispatchPayload['options'],
				callback: {
					messageType: AGENT_CHAT_CALLBACK_NOOP_MESSAGE_TYPE
				}
			},
			headers: {
				...(xpert.organizationId ? { organizationId: xpert.organizationId } : {}),
				...(resolvedUserId ? { userId: resolvedUserId } : {}),
				...(language ? { language } : {}),
				source
			}
		}

		await this.handoffQueue.enqueue(message)
	}

	private normalizeHumanInput(state: {
		[STATE_VARIABLE_HUMAN]: Record<string, any>
		[key: string]: any
	}) {
		const input = state?.[STATE_VARIABLE_HUMAN]
		if (input && typeof input === 'object') {
			return input
		}
		return {
			input: ''
		}
	}

	private normalizeChatFrom(from: unknown): TChatFrom {
		if (typeof from === 'string' && ALLOWED_CHAT_FROM.has(from)) {
			return from as TChatFrom
		}
		return 'job'
	}

	private toRunSource(from: TChatFrom): RunSource {
		switch (from) {
			case 'api':
				return 'api'
			case 'lark':
			case 'feishu':
				return 'lark'
			default:
				return 'xpert'
		}
	}
}
