import { ICommand } from '@nestjs/cqrs'


/**
 * Delete a task
 */
export class DeleteXpertTaskCommand implements ICommand {
	static readonly type = '[Xpert Task] Delete'

	constructor(
		public readonly name?: string,
	) {}
}
