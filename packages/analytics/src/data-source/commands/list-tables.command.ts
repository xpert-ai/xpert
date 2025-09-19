import { XpertToolContext } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * @returns IDSTable[] | IDSSchema[]
 */
export class ListTablesCommand implements ICommand {
	static readonly type = '[DataSource] List Tables'

	constructor(
		public readonly args: {
			/**
			 * ID of DataSource
			 */
			dataSource: string
			schema: string
		},
		public readonly context?: XpertToolContext
	) {}
}
