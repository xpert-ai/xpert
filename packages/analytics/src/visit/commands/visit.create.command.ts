import { IVisit } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class VisitCreateCommand implements ICommand {
	static readonly type = '[Visit] Create'

	constructor(public readonly input: IVisit) {}
}
