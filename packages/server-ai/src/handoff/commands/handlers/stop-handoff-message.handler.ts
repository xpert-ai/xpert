import { HandoffMessage } from '@xpert-ai/plugin-sdk'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { HandoffPendingResultService } from '../../pending-result.service'
import {
	HandoffQueueGatewayService,
	HandoffQueueScannableJobState
} from '../../dispatcher/handoff-queue-gateway.service'
import { HandoffCancelService } from '../../handoff-cancel.service'
import { LocalQueueTaskService } from '../../local-sync-task.service'
import { buildCanceledReason } from '../../cancel-reason'
import {
	StopHandoffMessageCommand,
	StopHandoffMessageResult
} from '../stop-handoff-message.command'

const QUEUED_JOB_STATES: HandoffQueueScannableJobState[] = ['waiting', 'delayed', 'paused']

@CommandHandler(StopHandoffMessageCommand)
export class StopHandoffMessageHandler implements ICommandHandler<StopHandoffMessageCommand> {
	constructor(
		private readonly queueGateway: HandoffQueueGatewayService,
		private readonly handoffCancelService: HandoffCancelService,
		private readonly pendingResults: HandoffPendingResultService,
		private readonly localTaskService: LocalQueueTaskService
	) {}

	async execute(command: StopHandoffMessageCommand): Promise<StopHandoffMessageResult> {
		const requestedMessageIds = this.uniqueStrings(command.input.messageIds)
		const requestedExecutionIds = this.uniqueStrings(command.input.executionIds)
		if (!requestedMessageIds.length && !requestedExecutionIds.length) {
			return {
				requested: {
					messageIds: requestedMessageIds,
					executionIds: requestedExecutionIds
				},
				matched: { messageIds: [], executionIds: [] },
				removed: { jobs: [] },
				aborted: { messageIds: [] },
				notFound: {
					messageIds: [],
					executionIds: []
				}
			}
		}

		const requestedMessageSet = new Set(requestedMessageIds)
		const requestedExecutionSet = new Set(requestedExecutionIds)
		const matchedJobs = await this.queueGateway.findJobs((message) =>
			this.matchesStopTargets(message, requestedMessageSet, requestedExecutionSet)
		)
		const queuedMatches = matchedJobs.filter((item) => QUEUED_JOB_STATES.includes(item.state))
		const activeMatches = matchedJobs.filter((item) => item.state === 'active')
		const removed = await this.queueGateway.removeJobs(queuedMatches)

		for (const item of removed) {
			const taskId = this.getTaskId(item.message)
			if (taskId) {
				this.localTaskService.remove(taskId)
			}
		}

		const activeMessageIds = this.uniqueStrings(
			activeMatches.map((item) => item.job.data?.id).filter((id): id is string => Boolean(id))
		)
		await this.handoffCancelService.cancelMessages(activeMessageIds, command.input.reason)

		const matchedMessageIds = this.uniqueStrings(
			matchedJobs.map((item) => item.job.data?.id).filter((id): id is string => Boolean(id))
		)
		const matchedExecutionIds = this.uniqueStrings(
			matchedJobs
				.map((item) => this.getExecutionId(item.job.data))
				.filter((id): id is string => Boolean(id))
		)
		const canceledReason = buildCanceledReason(command.input.reason)
		for (const messageId of matchedMessageIds) {
			this.pendingResults.cancel(messageId, canceledReason)
		}

		return {
			requested: {
				messageIds: requestedMessageIds,
				executionIds: requestedExecutionIds
			},
			matched: {
				messageIds: matchedMessageIds,
				executionIds: matchedExecutionIds
			},
			removed: {
				jobs: removed.map((item) => ({
					queueName: item.queueName,
					state: item.state,
					jobId: item.jobId,
					messageId: item.message.id,
					executionId: this.getExecutionId(item.message)
				}))
			},
			aborted: {
				messageIds: activeMessageIds
			},
			notFound: {
				messageIds: requestedMessageIds.filter((id) => !matchedMessageIds.includes(id)),
				executionIds: requestedExecutionIds.filter((id) => !matchedExecutionIds.includes(id))
			}
		}
	}

	private matchesStopTargets(
		message: HandoffMessage,
		messageIdSet: Set<string>,
		executionIdSet: Set<string>
	): boolean {
		if (!message) {
			return false
		}
		if (messageIdSet.size > 0 && messageIdSet.has(message.id)) {
			return true
		}
		const executionId = this.getExecutionId(message)
		if (executionIdSet.size > 0 && executionId && executionIdSet.has(executionId)) {
			return true
		}
		return false
	}

	private uniqueStrings(values: Array<string | undefined> | undefined): string[] {
		return Array.from(new Set((values ?? []).filter((value): value is string => typeof value === 'string')))
	}

	private getExecutionId(message: HandoffMessage): string | undefined {
		const executionId = message.payload?.executionId
		return typeof executionId === 'string' && executionId.length > 0 ? executionId : undefined
	}

	private getTaskId(message: HandoffMessage): string | undefined {
		const taskId = message.payload?.taskId
		return typeof taskId === 'string' && taskId.length > 0 ? taskId : undefined
	}
}
