import { ICommand } from '@nestjs/cqrs'

export class XpertDeleteCommand implements ICommand {
	static readonly type = '[Xpert] Delete'

	constructor(public readonly id: string) { }
}
