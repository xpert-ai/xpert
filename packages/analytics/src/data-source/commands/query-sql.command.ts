import { XpertToolContext } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class QuerySqlCommand implements ICommand {
	static readonly type = '[DataSource] Query SQL'

	constructor(
		public readonly args: {
			/**
			 * ID of DataSource
			 */
			dataSource: string
			schema: string
			statement: string
		},
		public readonly context?: XpertToolContext
	) {}
}
