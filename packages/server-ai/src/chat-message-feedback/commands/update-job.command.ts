import { TSummaryJob } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatMessageFeedbackUpdateJobCommand implements ICommand {
	static readonly type = '[Chat Message Feedback] Update job'

	constructor(
		public readonly id: string,
		public readonly job: Partial<TSummaryJob>
	) {}
}
