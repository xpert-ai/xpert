import { IBusinessArea } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class BusinessAreaCreateCommand implements ICommand {
	static readonly type = '[Business Area] Create'

	constructor(public readonly input: IBusinessArea) {}
}
