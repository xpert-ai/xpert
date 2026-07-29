import { Inject, InternalServerErrorException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DataSourceStrategyRegistry, DBQueryRunner, IDataSourceStrategy } from '@xpert-ai/plugin-sdk'
import { DataSourceStrategyQuery } from '../datasource.strategy.query'

@QueryHandler(DataSourceStrategyQuery)
export class DataSourceStrategyHandler implements IQueryHandler<DataSourceStrategyQuery> {
	@Inject(DataSourceStrategyRegistry)
	private readonly dataSourceStrategyRegistry: DataSourceStrategyRegistry

	async execute(query: DataSourceStrategyQuery) {
		const { dataSourceId, name, options } = query
		let strategy: IDataSourceStrategy
		try {
			strategy = this.dataSourceStrategyRegistry.get(name)
		} catch {
			throw new InternalServerErrorException(`DataSource strategy not found for type: ${name}`)
		}

		const runner: DBQueryRunner = await strategy.create(options, dataSourceId)
		if (!runner) {
			throw new InternalServerErrorException(`DataSource strategy not found for type: ${name}`)
		}
		return runner
	}
}
