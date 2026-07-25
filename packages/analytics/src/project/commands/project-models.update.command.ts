import { ICommand } from '@nestjs/cqrs'

export class ProjectModelsUpdateCommand implements ICommand {
	static readonly type = '[Project] Update Models'

	constructor(
		public readonly projectId: string,
		public readonly modelIds: string[]
	) {}
}
