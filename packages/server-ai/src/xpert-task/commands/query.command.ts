import { ICommand } from '@nestjs/cqrs'


/**
 * Query tasks
 */
export class QueryXpertTaskCommand implements ICommand {
	static readonly type = '[Xpert Task] Query'

	constructor(
		public readonly xpertId?: string,
	) {}
}
