import { Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ProcessResult, RequestContext } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../../message-queue.service'
import { XPERT_HANDOFF_QUEUE } from '../../constants'
import {
	AGENT_CHAT_MESSAGE_TYPE,
	LocalQueueTaskService,
} from '../../local-sync-task.service'
import { EnqueueAgentChatMessageCommand } from '../enqueue-agent-chat-message.command'

@CommandHandler(EnqueueAgentChatMessageCommand)
export class EnqueueAgentChatMessageHandler<T = any> implements ICommandHandler<EnqueueAgentChatMessageCommand> {
	readonly #logger = new Logger(EnqueueAgentChatMessageHandler.name)

	@Inject(LocalQueueTaskService)
	private readonly localTaskService: LocalQueueTaskService

	@Inject(HandoffQueueService)
	private readonly handoffQueue: HandoffQueueService

	public async execute(command: EnqueueAgentChatMessageCommand<T>): Promise<T> {
		const { input: options, task } = command

		const requestUser = options.user ?? RequestContext.currentUser()
		const tenantId = options.tenantId ?? requestUser?.tenantId ?? RequestContext.currentTenantId()
		if (!tenantId) {
			throw new Error(`Missing tenantId for local handoff task "${options.id}"`)
		}

		const organizationId = options.organizationId ?? RequestContext.getOrganizationId()
		const userId = options.userId ?? requestUser?.id ?? RequestContext.currentUserId()
		const language = RequestContext.getLanguageCode()

		let hasOutput = false
		let output!: T

		const taskId = this.localTaskService.register(async (ctx) => {
			output = await task(ctx)
			hasOutput = true
			return { status: 'ok' }
		})

		try {
			const result = await this.handoffQueue.enqueueAndWait(
				{
					id: options.id,
					type: options.messageType ?? AGENT_CHAT_MESSAGE_TYPE,
					version: 1,
					tenantId,
					sessionKey: options.sessionKey,
					businessKey: options.businessKey ?? options.id,
					attempt: 1,
					maxAttempts: 1,
					enqueuedAt: Date.now(),
					traceId: options.traceId ?? options.id,
					payload: {
						taskId,
						executionId: options.executionId,
						integrationId: options.integrationId
					},
					headers: {
						...(organizationId ? { organizationId } : {}),
						...(userId ? { userId } : {}),
						...(language ? { language } : {}),
						...(options.conversationId ? { conversationId: options.conversationId } : {}),
						source: options.source,
						handoffQueue: options.queueName ?? XPERT_HANDOFF_QUEUE,
						requestedLane: options.requestedLane ?? 'main',
						...(options.timeoutMs ? { policyTimeoutMs: `${options.timeoutMs}` } : {}),
						...(options.integrationId ? { integrationId: options.integrationId } : {})
					}
				},
				{
					timeoutMs: options.timeoutMs
				}
			)

			assertLocalTaskResult(options.id, result)
			if (!hasOutput) {
				throw new Error(`Local handoff task "${options.id}" completed without output`)
			}

			return output
		} catch (error) {
			if (this.localTaskService.remove(taskId)) {
				this.#logger.warn(
					`Removed dangling local task "${taskId}" after enqueue/wait failure for run "${options.id}"`
				)
			}
			throw error
		}
	}
}

function assertLocalTaskResult(runId: string, result: ProcessResult) {
	if (result.status === 'dead') {
		throw new Error(result.reason)
	}
	if (result.status === 'retry') {
		throw new Error(`Local handoff task "${runId}" returned unexpected retry result`)
	}
}
