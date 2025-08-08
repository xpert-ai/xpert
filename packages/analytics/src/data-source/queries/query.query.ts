import { IQuery } from '@nestjs/cqrs'

export class DataSourceQuery implements IQuery {
	static readonly type = '[DataSource] Query'

	constructor(public readonly dataSourceId: string,
		public readonly params: {
			command: 'QuerySql' | 'ListTables' | 'TableSchema'
			statement?: string
			schema?: string
			table?: string
		},
	) {}
}
