import { LongTermMemoryTypeEnum } from '@metad/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { ChatConversationService } from '../../conversation.service'
import { CancelSummaryJobCommand } from '../cancel-summary.command'
import { ScheduleSummaryJobCommand } from '../schedule-summary.command'

@CommandHandler(ScheduleSummaryJobCommand)
export class ScheduleSummaryJobHandler implements ICommandHandler<ScheduleSummaryJobCommand> {
	private readonly logger = new Logger(ScheduleSummaryJobHandler.name)

	constructor(
		private readonly service: ChatConversationService,
		private readonly commandBus: CommandBus,
		private schedulerRegistry: SchedulerRegistry
	) {}

	public async execute(command: ScheduleSummaryJobCommand): Promise<void> {
		const { conversationId, userId, memory } = command
		// 1. Cancel any previous jobs
		await this.commandBus.execute(new CancelSummaryJobCommand(conversationId))

		// 2. Creating a New Job
		const timeout = setTimeout(async () => {
			try {
				await this.service.triggerSummary(conversationId, LongTermMemoryTypeEnum.PROFILE, userId)
			} catch (error) {
				this.logger.error(`Failed to add summarize job for conversation ${conversationId}:`, error)
			}
		}, memory.profile?.afterSeconds ? (memory.profile.afterSeconds * 1000) : 10000) // x seconds delay

		this.schedulerRegistry.addTimeout(conversationId, timeout)
		this.logger.debug(`Scheduled summary job for conversation ${conversationId} in ${memory.profile?.afterSeconds ?? 10} seconds.`)
	}
}
