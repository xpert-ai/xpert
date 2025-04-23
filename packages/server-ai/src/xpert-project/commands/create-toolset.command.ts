import { ICommand } from '@nestjs/cqrs'

export class CreateToolsetCommand implements ICommand {
	static readonly type = '[Xpert Project] Create toolset'

	constructor(
		public readonly projectId: string
	) {}
}
