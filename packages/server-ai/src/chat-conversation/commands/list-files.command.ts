import { ICommand } from '@nestjs/cqrs'

export class ListConvFilesCommand implements ICommand {
	static readonly type = '[Conversation] List files'

	constructor(
		public readonly conversationId: string,
	) {}
}
