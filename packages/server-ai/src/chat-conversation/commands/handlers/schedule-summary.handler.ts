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

        const jobs: Array<{ type: LongTermMemoryTypeEnum; afterSeconds: number }> = []
        if (memory.profile?.enabled) {
            jobs.push({
                type: LongTermMemoryTypeEnum.PROFILE,
                afterSeconds: memory.profile.afterSeconds ?? 10
            })
        }
        if (memory.qa?.enabled) {
            jobs.push({
                type: LongTermMemoryTypeEnum.QA,
                afterSeconds: memory.profile?.afterSeconds ?? 10
            })
        }

        for (const job of jobs) {
            const timeoutKey = `${conversationId}:${job.type}`
            const timeout = setTimeout(async () => {
                try {
                    await this.service.triggerSummary(conversationId, job.type, userId)
                } catch (error) {
                    this.logger.error(
                        `Failed to add summarize job for conversation ${conversationId}(${job.type}):`,
                        error
                    )
                }
            }, job.afterSeconds * 1000)

            this.schedulerRegistry.addTimeout(timeoutKey, timeout)
            this.logger.debug(
                `Scheduled summary job for conversation ${conversationId}(${job.type}) in ${job.afterSeconds} seconds.`
            )
        }
    }
}
