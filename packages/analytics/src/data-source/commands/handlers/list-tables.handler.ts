import { IDSSchema, IDSTable } from '@metad/adapter'
import { XpertToolsetService } from '@metad/server-ai'
import { omit } from '@metad/server-common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { ListTablesCommand } from '../list-tables.command'
import { DataSourceStrategyQuery } from '../../queries'

@CommandHandler(ListTablesCommand)
export class ListTablesHandler implements ICommandHandler<ListTablesCommand> {
	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly dataSourceService: DataSourceService,
		private readonly queryBus: QueryBus
	) {
	}

	public async execute(command: ListTablesCommand): Promise<IDSTable[] | IDSSchema[]> {
		const { dataSource: dataSourceId, schema } = command.args
		const isDev = process.env.NODE_ENV === 'development'

		const dataSource = await this.dataSourceService.prepareDataSource(dataSourceId)

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
			const result = await runner.getSchema(schema)
			// Omit empty columns
			return schema ? result[0]?.tables?.map((table) => omit(table, 'columns')) : result.map((s) => {
				return {
					...s,
					tables: s.tables?.map((table) => omit(table, 'columns'))
				}
			})
		} finally {
			await runner.teardown()
		}
	}
}
