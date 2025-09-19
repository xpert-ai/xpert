import { createQueryRunnerByType } from '@metad/adapter'
import { XpertToolsetService } from '@metad/server-ai'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { QuerySqlCommand } from '../query-sql.command'

@CommandHandler(QuerySqlCommand)
export class QuerySqlHandler implements ICommandHandler<QuerySqlCommand> {
	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly dataSourceService: DataSourceService
	) {
		this.toolsetService.registerCommand('QuerySql', QuerySqlCommand)
	}

	public async execute(command: QuerySqlCommand): Promise<any[]> {
		const { dataSource: dataSourceId, schema, statement } = command.args
		const isDev = process.env.NODE_ENV === 'development'
		
		const dataSource = await this.dataSourceService.prepareDataSource(dataSourceId)

		const runner = createQueryRunnerByType(dataSource.type.type, {
			...dataSource.options,
			debug: isDev,
			trace: isDev
		})

		try {
			// Query samples data
			const data = await runner.runQuery(statement, { catalog: schema })

			return data
		} finally {
			await runner.teardown()
		}
	}
}
