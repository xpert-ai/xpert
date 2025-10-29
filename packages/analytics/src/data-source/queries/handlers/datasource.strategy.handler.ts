import { AdapterBaseOptions, createQueryRunnerByType, DBQueryRunner } from '@metad/adapter'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DataSourceStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { DataSourceStrategyQuery } from '../datasource.strategy.query'

@QueryHandler(DataSourceStrategyQuery)
export class DataSourceStrategyHandler implements IQueryHandler<DataSourceStrategyQuery> {
	private readonly logger = new Logger(DataSourceStrategyHandler.name)

	@Inject(DataSourceStrategyRegistry)
	private readonly dataSourceStrategyRegistry: DataSourceStrategyRegistry


	async execute(query: DataSourceStrategyQuery) {
		const { name, options } = query
		let runner: DBQueryRunner = null
		try {
			const strategy = this.dataSourceStrategyRegistry.get(name)
			runner = await strategy.create(options)
		} catch (error) {
			runner = createQueryRunnerByType(name, options as unknown as AdapterBaseOptions)
		}
		return runner
	}
}
