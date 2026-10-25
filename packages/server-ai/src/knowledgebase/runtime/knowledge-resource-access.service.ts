import { InjectRepository } from '@nestjs/typeorm'
import { Injectable } from '@nestjs/common'
import { Repository } from 'typeorm'
import { RequestContext, type ContentOperation, type ContentResourceReference } from '@xpert-ai/plugin-sdk'
import { ContentResourceService } from '../../content-resource/content-resource.service'
import { Knowledgebase } from '../knowledgebase.entity'

/** Resource policies take precedence over authoring workspace, legacy owner and visibility flags. */
@Injectable()
export class KnowledgeResourceAccessService {
    constructor(
        @InjectRepository(Knowledgebase) private readonly knowledgebases: Repository<Knowledgebase>,
        private readonly resources: ContentResourceService
    ) {}
    async authorize(id: string, operation: ContentOperation) {
        const kb = await this.knowledgebases.findOne({ where: { id }, select: { id: true, resourceRef: true } })
        if (!kb?.resourceRef) return false
        await this.authorizeReference(kb.resourceRef, operation)
        return true
    }
    authorizeReference(resource: ContentResourceReference, operation: ContentOperation) {
        return this.resources.authorize({
            ...resource,
            operation,
            actor: {
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId(),
                userId: RequestContext.currentUserId()
            }
        })
    }
}
