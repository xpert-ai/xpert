import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { ChatConversationService } from '../../conversation.service'
import { CancelSummaryJobCommand } from '../cancel-summary.command'

@CommandHandler(CancelSummaryJobCommand)
export class CancelSummaryJobHandler implements ICommandHandler<CancelSummaryJobCommand> {
	private readonly logger = new Logger(CancelSummaryJobHandler.name)

	constructor(
		private readonly service: ChatConversationService,
		private readonly commandBus: CommandBus,
		private readonly schedulerRegistry: SchedulerRegistry
	) {}

	public async execute(command: CancelSummaryJobCommand): Promise<void> {
		const conversationId = command.id
		try {
			this.schedulerRegistry.deleteTimeout(conversationId)
			this.logger.debug(`Successfully cancelled timeout ${conversationId}`)
		} catch (error) {
			// this.logger.warn(`Timeout ${conversationId} not found!`)
		}
	}
}
