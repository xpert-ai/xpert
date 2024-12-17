import { TSummaryJob } from '@metad/contracts'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ChatMessageService } from '../../chat-message.service'
import { ChatMessageUpdateJobCommand } from '../update-job.command'

@CommandHandler(ChatMessageUpdateJobCommand)
export class ChatMessageUpdateJobHandler implements ICommandHandler<ChatMessageUpdateJobCommand> {
	constructor(
		private readonly service: ChatMessageService,
		private readonly commandBus: CommandBus
	) {}

	public async execute(command: ChatMessageUpdateJobCommand): Promise<void> {
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
