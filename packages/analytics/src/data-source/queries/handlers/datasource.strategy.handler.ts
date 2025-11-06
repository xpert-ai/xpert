import { AdapterBaseOptions, createQueryRunnerByType1 } from '@metad/adapter'
import { Inject, InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { DataSourceStrategyRegistry, DBQueryRunner } from '@xpert-ai/plugin-sdk'
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
			runner = createQueryRunnerByType1(name, options as unknown as AdapterBaseOptions)
		}

		if (!runner) {
			throw new InternalServerErrorException(`DataSource strategy not found for type: ${name}`)
		}
		return runner
	}
}
