import { DataSourceService, DataSourceStrategyQuery } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { XpertDatabaseAdapterQuery } from '../get-database-adapter.query'

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
