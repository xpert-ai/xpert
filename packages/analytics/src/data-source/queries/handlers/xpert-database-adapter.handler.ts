import { XpertDatabaseAdapterQuery } from '@metad/server-ai'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source.service'
import { DataSourceStrategyQuery } from '../datasource.strategy.query'

@QueryHandler(XpertDatabaseAdapterQuery)
export class XpertDatabaseAdapterQueryHandler implements IQueryHandler<XpertDatabaseAdapterQuery> {
	private readonly logger = new Logger(XpertDatabaseAdapterQueryHandler.name)

	constructor(
		private readonly dsService: DataSourceService,
		private readonly queryBus: QueryBus
	) {}

	async execute(query: XpertDatabaseAdapterQuery) {
		const dataSource = await this.dsService.findOneByIdString(query.options.id, {
			relations: ['type']
		})
		const runner = await this.queryBus.execute(
			new DataSourceStrategyQuery(dataSource.type.type, dataSource.options, dataSource.id)
		)
		return runner
	}
}
