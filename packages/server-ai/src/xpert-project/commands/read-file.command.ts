import { ICommand } from '@nestjs/cqrs'

export class ReadProjectFileCommand implements ICommand {
	static readonly type = '[Xpert Project] Read file'

	constructor(
		public readonly projectId: string,
		public readonly filePath: string,
	) {}
}
