import { XpertToolContext } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class QuerySqlCommand implements ICommand {
	static readonly type = '[DataSource] Query SQL'

	constructor(
		public readonly args: {
			dataSource: string
			schema: string
			statement: string
		},
		public readonly context?: XpertToolContext
	) {}
}
