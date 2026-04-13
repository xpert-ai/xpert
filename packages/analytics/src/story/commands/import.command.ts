import { IStory } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class StoryImportCommand implements ICommand {
	static readonly type = '[Story] Import'

	constructor(public readonly input: IStory) {}
}
