import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ExecutionRuntimeService } from '../../../runtime'
import { ExecutionCancelService } from '../../../shared/execution/execution-cancel.service'
import { CancelChatCommand } from '../cancel-chat.command'

export interface CancelChatResult {
	abortedRunIds: string[]
	abortedExecutionIds: string[]
}

@CommandHandler(CancelChatCommand)
export class CancelChatHandler implements ICommandHandler<CancelChatCommand> {
	private readonly logger = new Logger(CancelChatHandler.name)

	constructor(
		private readonly executionRuntime: ExecutionRuntimeService,
		private readonly executionCancelService: ExecutionCancelService
	) {}

	public async execute(command: CancelChatCommand): Promise<CancelChatResult> {
		const { tenantId, user, data } = command.input
		const { conversationId, id: messageId } = data

		const result: CancelChatResult = {
			abortedRunIds: [],
			abortedExecutionIds: []
		}

		this.logger.log(
			`Cancel request: conversationId=${conversationId}, messageId=${messageId}, user=${user?.id}`
		)

		// Strategy 1: Abort by conversationId through runtime registry
		if (conversationId) {
			const abortedRuns = this.executionRuntime.abortByConversation(
				conversationId,
				'User canceled'
			)
			result.abortedRunIds.push(...abortedRuns)

			if (abortedRuns.length > 0) {
				this.logger.log(
					`Aborted ${abortedRuns.length} runs via runtime: ${abortedRuns.join(', ')}`
				)
			}
		}

		// Strategy 2: Also try to cancel via ExecutionCancelService (for backward compatibility)
		// This handles runs that were registered directly with executionCancelService
		// (e.g., from xpert-agent/invoke.handler)
		if (conversationId) {
			// Get runs from runtime that have executionId
			const runsWithExecution = this.executionRuntime
				.getRunsByConversation(conversationId)
				.filter((r) => r.executionId)
				.map((r) => r.executionId!)

			if (runsWithExecution.length > 0) {
				await this.executionCancelService.cancelExecutions(
					runsWithExecution,
					'User canceled'
				)
				result.abortedExecutionIds.push(...runsWithExecution)

				this.logger.log(
					`Canceled ${runsWithExecution.length} executions via cancel service: ${runsWithExecution.join(', ')}`
				)
			}
		}

		// Strategy 3: Try session key based abort
		// Build possible session keys for this conversation
		const possibleSessionKeys = [
			`chat:conversation:${conversationId}`
		]

		for (const sessionKey of possibleSessionKeys) {
			const aborted = this.executionRuntime.abortBySessionKey(sessionKey, 'User canceled')
			for (const runId of aborted) {
				if (!result.abortedRunIds.includes(runId)) {
					result.abortedRunIds.push(runId)
				}
			}
		}

		const totalAborted = result.abortedRunIds.length + result.abortedExecutionIds.length
		if (totalAborted === 0) {
			this.logger.debug(
				`No active runs found for conversationId=${conversationId}`
			)
		} else {
			this.logger.log(
				`Cancel complete: ${result.abortedRunIds.length} runs, ${result.abortedExecutionIds.length} executions aborted`
			)
		}

		return result
	}
}
