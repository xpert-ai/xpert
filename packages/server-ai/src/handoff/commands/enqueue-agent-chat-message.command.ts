import { IUser } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { LaneName, RunSource } from '@xpert-ai/plugin-sdk'
import { LocalQueuedTaskContext } from '../types'
import { HandoffQueueName } from '../constants'

export interface EnqueueAgentChatMessageOptions {
	id: string
	messageType?: string
	tenantId?: string
	organizationId?: string
	userId?: string
	user?: IUser
	sessionKey: string
	conversationId?: string
	executionId?: string
	integrationId?: string
	source: RunSource
	requestedLane?: LaneName
	/**
	 * Force local task to specific queue.
	 * Default is `handoff` to keep process-local callback behavior stable.
	 */
	queueName?: HandoffQueueName
	timeoutMs?: number
	traceId?: string
	businessKey?: string
}

export class EnqueueAgentChatMessageCommand<T = unknown> extends Command<T> {
	static readonly type = '[Handoff] Enqueue Agent Chat Message'

	constructor(
		public readonly input: EnqueueAgentChatMessageOptions,
		public readonly task: (ctx: LocalQueuedTaskContext) => Promise<T>
	) {
		super()
	}
}
