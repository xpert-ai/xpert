import { TLongTermMemory } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class ScheduleSummaryJobCommand implements ICommand {
	static readonly type = '[Chat Conversation] Schedule summary job'

	constructor(
	 	public readonly conversationId: string,
	 	public readonly userId: string,
	 	public readonly memory: TLongTermMemory,
	) {}
}
