import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated use SandboxFileToolset
 */
export class CreateFileToolsetCommand implements ICommand {
	static readonly type = '[Xpert Project] Create file toolset'

	constructor(
		public readonly projectId: string
	) {}
}
