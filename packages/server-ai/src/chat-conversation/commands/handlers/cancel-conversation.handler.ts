import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { CancelConversationCommand } from '../cancel-conversation.command'
import { ChatConversationService } from '../../conversation.service'
import { ChatMessageService } from '../../../chat-message/chat-message.service'
import { ExecutionCancelService } from '../../../shared/'
import { IChatMessage, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'

/**
 * Handler to cancel
 * 1. a chat conversation and its associated executions.
 * 2. a thread's specific execution.
 * 
 * mark status of ChatMessages as 'aborted'
 * mark status of XpertAgentExecutions as 'interrupted'
 * mark status of ChatConversation as 'interrupted'
 * invoke ExecutionCancelService to handle any additional cancellation logic.
 */
@CommandHandler(CancelConversationCommand)
export class CancelConversationHandler implements ICommandHandler<CancelConversationCommand> {
	constructor(
		private readonly service: ChatConversationService,
		private readonly messageService: ChatMessageService,
		private readonly executionCancelService: ExecutionCancelService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: CancelConversationCommand) {
		const { conversationId, threadId, executionId } = command.input
		const conversation = conversationId
			? await this.service.findOne(conversationId, { relations: ['messages'] })
			: await this.service.findOne({ where: { threadId }, relations: ['messages'] })

		if (!conversation) {
			return { canceledExecutionIds: [] }
		}
		const messages = (conversation.messages ?? []) as IChatMessage[]
		const aiMessages = messages.filter((message) => message.role === 'ai' && message.executionId)

		if (!aiMessages.length) {
			return { canceledExecutionIds: [] }
		}

		const targetMessages = executionId
			? aiMessages.filter((message) => message.executionId === executionId)
			: (() => {
				const runningMessages = aiMessages.filter((message) =>
					['thinking', 'reasoning', 'answering'].includes(message.status as string)
				)
				const sortedMessages = [...aiMessages].sort((a, b) => {
					const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
					const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
					return aTime - bTime
				})
				const fallbackMessage = sortedMessages[sortedMessages.length - 1]
				return runningMessages.length ? runningMessages : [fallbackMessage]
			})()

		if (!targetMessages.length) {
			return { canceledExecutionIds: [] }
		}
		const executionIds = Array.from(
			new Set(targetMessages.map((message) => message.executionId).filter(Boolean))
		) as string[]
		const messagesToUpdate = aiMessages.filter((message) => executionIds.includes(message.executionId))

		for (const message of messagesToUpdate) {
			await this.messageService.update(message.id, {
				status: 'aborted',
				error: 'Canceled by user'
			})
		}

		for (const id of executionIds) {
			await this.commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					id,
					status: XpertAgentExecutionStatusEnum.INTERRUPTED,
					error: 'Canceled by user'
				})
			)
		}

		if (executionIds.length) {
			await this.executionCancelService.cancelExecutions(executionIds, 'Canceled by user')
		}

		await this.service.update(conversation.id, {
			status: 'interrupted',
			error: 'Canceled by user'
		})

		return { canceledExecutionIds: executionIds }
	}
}
