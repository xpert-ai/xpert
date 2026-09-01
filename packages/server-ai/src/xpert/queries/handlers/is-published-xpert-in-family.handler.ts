import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { PublishedXpertAccessService } from '../../published-xpert-access.service'
import { IsPublishedXpertInFamilyQuery } from '../is-published-xpert-in-family.query'

@QueryHandler(IsPublishedXpertInFamilyQuery)
export class IsPublishedXpertInFamilyHandler implements IQueryHandler<IsPublishedXpertInFamilyQuery> {
    constructor(private readonly publishedXpertAccessService: PublishedXpertAccessService) {}

    async execute(query: IsPublishedXpertInFamilyQuery) {
        const referenceXpert = await this.publishedXpertAccessService.getAccessiblePublishedXpert(
            query.referenceXpertId
        )
        return this.publishedXpertAccessService.isPublishedXpertInFamily(query.candidateXpertId, referenceXpert)
    }
}
