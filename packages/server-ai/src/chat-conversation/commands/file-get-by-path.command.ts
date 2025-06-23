import { ICommand } from '@nestjs/cqrs'

export class ConvFileGetByPathCommand implements ICommand {
	static readonly type = '[Chat Conversation] Get file by path'

	constructor(
		public readonly id: string,
		public readonly path: string,
	) {}
}
