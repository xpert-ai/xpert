import { DataSourceService } from '@xpert-ai/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertDatabasesQuery } from '../get-databases.query'

@QueryHandler(XpertDatabasesQuery)
export class XpertDatabasesQueryHandler implements IQueryHandler<XpertDatabasesQuery> {
    private readonly logger = new Logger(XpertDatabasesQueryHandler.name)

    constructor(private readonly dsService: DataSourceService) {}
    async execute(query: XpertDatabasesQuery) {
        const { items } = await this.dsService.findMyAll({ relations: ['type'] })
        return items
            .filter((ds) => ds.type?.protocol === query.options.protocol)
            .map((ds) => ({
                id: ds.id,
                name: ds.name,
                type: ds.type?.type, // Return database type (e.g., 'mysql', 'postgres')
                protocol: ds.type?.protocol
            }))
    }
}
