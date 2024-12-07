import { ICommand } from '@nestjs/cqrs'

/**
 */
export class ThreadDeleteCommand implements ICommand {
	static readonly type = '[Agent Protocol] Thread delete'

	constructor(
		public readonly id: string
	) {}
}
