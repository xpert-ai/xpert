import { ICommand } from '@nestjs/cqrs'

export class CreateProjectToolsetCommand implements ICommand {
	static readonly type = '[Xpert Project] Create toolset'

	constructor(
		public readonly projectId: string
	) {}
}
