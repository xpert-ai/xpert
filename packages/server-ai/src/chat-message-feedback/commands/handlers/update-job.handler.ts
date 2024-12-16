import { TSummaryJob } from '@metad/contracts'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatMessageFeedbackService } from '../../feedback.service'
import { ChatMessageFeedbackUpdateJobCommand } from '../update-job.command'

@CommandHandler(ChatMessageFeedbackUpdateJobCommand)
export class ChatMessageFeedbackUpdateJobHandler implements ICommandHandler<ChatMessageFeedbackUpdateJobCommand> {
	constructor(
		private readonly service: ChatMessageFeedbackService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: ChatMessageFeedbackUpdateJobCommand): Promise<void> {
		const { id, job } = command
		const feedback = await this.service.findOne(id)
		feedback.summaryJob ??= {} as TSummaryJob
		this.service.update(id, {
			summaryJob: {
				...feedback.summaryJob,
				...job
			}
		})
	}
}
