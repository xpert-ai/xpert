import { ICommand } from '@nestjs/cqrs'

export class CancelSummaryJobCommand implements ICommand {
	static readonly type = '[Chat Conversation] Cancel summary job'

	constructor(public readonly id: string) {}
}
