import { IXpertTask } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'
import { CronCallback } from 'cron'


/**
 * Create task
 */
export class CreateXpertTaskCommand implements ICommand {
	static readonly type = '[Xpert Task] Create'

	constructor(
		public readonly task: IXpertTask,
		public readonly cronCommand?: CronCallback<null, boolean>
	) {}
}
