import { ICommand } from '@nestjs/cqrs'

/**
 * Delete a file attachment in conversation
 * 
 */
export class ConvFileDeleteCommand implements ICommand {
	static readonly type = '[Chat Conversation] Delete file'

	constructor(
		public readonly id: string,
		public readonly filePath: string,
	) {}
}
