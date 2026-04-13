import { IStory } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class StoryCopyCommand implements ICommand {
	static readonly type = '[Story] Copy'

	constructor(public readonly input: IStory) {}
}
