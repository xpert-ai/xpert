import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated
 */
export class DeleteProjectFileCommand implements ICommand {
	static readonly type = '[Xpert Project] Delete file'

	constructor(
		public readonly projectId: string,
		public readonly filePath: string,
	) {}
}
