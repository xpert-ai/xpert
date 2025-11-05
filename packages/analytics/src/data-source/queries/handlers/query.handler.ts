import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { DataSourceQuery } from '../query.query'
import { DataSourceStrategyQuery } from '../datasource.strategy.query'

@QueryHandler(DataSourceQuery)
export class DataSourceQueryHandler implements IQueryHandler<DataSourceQuery> {
	private readonly logger = new Logger(DataSourceQueryHandler.name)

	constructor(
		private readonly dsService: DataSourceService,
		private readonly queryBus: QueryBus
	) {}

	async execute(query: DataSourceQuery) {
		const { command, schema, table, statement } = query.params
		const isDev = process.env.NODE_ENV === 'development'

		const dataSource = await this.dsService.prepareDataSource(query.dataSourceId)
		// const runner = createQueryRunnerByType(dataSource.type.type, {
		// 	...dataSource.options,
		// 	debug: isDev,
		// 	trace: isDev
		// })
		const runner = await this.queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, {
			...dataSource.options,
			debug: isDev,
			trace: isDev
		}))

		try {
			switch (command) {
				case 'QuerySql':
					return await runner.runQuery(statement, { catalog: schema })
				case 'ListTables':
					return await runner.getSchema(schema)
				case 'TableSchema': {
					if (!table) {
						throw new Error('Table name is required for TableSchema command')
					}
					const tableName = table.replace(new RegExp(`^${schema}\\.`), '')
					const tableSchema = await runner.getSchema(schema, tableName)
					if (!tableSchema || tableSchema.length === 0) {
						throw new Error(`Table schema for '${table}' not found`)
					}
					return tableSchema[0].tables || []
				}
				default:
					throw new Error(`Unsupported command: ${command}`)
			}
		} finally {
			await runner.teardown()
		}
	}
}
