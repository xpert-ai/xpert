import { TSummaryJob } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ChatMessageUpdateJobCommand implements ICommand {
	static readonly type = '[Chat Message] Update job'

	constructor(
		public readonly id: string,
		public readonly job: Partial<TSummaryJob>
	) {}
}
