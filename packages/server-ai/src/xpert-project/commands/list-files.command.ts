import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated
 */
export class ListProjectFilesCommand implements ICommand {
	static readonly type = '[Xpert Project] List files'

	constructor(
		public readonly projectId: string,
	) {}
}
