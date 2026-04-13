import { IXpert } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class XpertCreateCommand implements ICommand {
	static readonly type = '[Xpert] Create'

	constructor(public readonly input: Partial<IXpert>) { }
}
