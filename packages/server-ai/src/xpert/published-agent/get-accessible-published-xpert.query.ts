import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { IXpert } from '@xpert-ai/contracts'
import { PublishedXpertAccessService } from '../published-xpert-access.service'

/** Load a published Assistant through the current actor's audience and live access checks. */
export class GetAccessiblePublishedXpertQuery extends Query<IXpert> {
    constructor(
        readonly xpertId: string,
        readonly relations?: string[]
    ) {
        super()
    }
}

@QueryHandler(GetAccessiblePublishedXpertQuery)
export class GetAccessiblePublishedXpertHandler implements IQueryHandler<GetAccessiblePublishedXpertQuery> {
    constructor(private readonly access: PublishedXpertAccessService) {}

    execute(query: GetAccessiblePublishedXpertQuery): Promise<IXpert> {
        return this.access.getAccessiblePublishedXpert(query.xpertId, { relations: query.relations })
    }
}
