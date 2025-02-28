import { createQueryRunnerByType } from '@metad/adapter'
import { IDSTable } from '@metad/contracts'
import { XpertToolsetService } from '@metad/server-ai'
import { NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { QuerySchemaCommand } from '../query-schema.command'

@CommandHandler(QuerySchemaCommand)
export class QuerySchemaHandler implements ICommandHandler<QuerySchemaCommand> {
	constructor(
		private readonly toolsetService: XpertToolsetService,
		private readonly dataSourceService: DataSourceService
	) {
		this.toolsetService.registerCommand('QuerySchema', QuerySchemaCommand)
	}

	public async execute(command: QuerySchemaCommand): Promise<IDSTable[]> {
		const { dataSource: dataSourceId, schema, tables } = command.args
		const isDev = process.env.NODE_ENV === 'development'

		const dataSource = await this.dataSourceService.prepareDataSource(dataSourceId)

		const runner = createQueryRunnerByType(dataSource.type.type, {
			...dataSource.options,
			debug: isDev,
			trace: isDev
		})

		try {
			const results = []
			for await (const table of tables) {
				const tableName = table.replace(new RegExp(`^${schema}\\.`), '')
				const tableSchema = await runner.getSchema(schema, tableName)
				// Query samples data
				const data = await runner.runQuery(`SELECT * FROM ${table} LIMIT 10`, { catalog: schema })

				const _table = tableSchema[0]?.tables[0]
				if (!_table) {
					throw new NotFoundException(`Not found schema of table '${table}'`)
				}
				results.push({
					..._table,
					sample_data: data?.data
				})
			}

			return results
		} finally {
			await runner.teardown()
		}
	}
}
