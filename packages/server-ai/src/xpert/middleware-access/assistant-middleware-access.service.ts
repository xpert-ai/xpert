import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { UserOrganization } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import {
    AgentMiddlewareRegistry,
    AssistantMiddlewareAccessRuntimeCapability,
    RuntimeCapabilityProvider,
    type AssistantMiddlewareAccessApi
} from '@xpert-ai/plugin-sdk'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { Xpert } from '../xpert.entity'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { requireAssistantMiddleware } from './assistant-middleware'

@Injectable()
@RuntimeCapabilityProvider(AssistantMiddlewareAccessRuntimeCapability)
export class AssistantMiddlewareAccessService implements AssistantMiddlewareAccessApi {
    constructor(
        @Inject(PublishedXpertAccessService)
        private readonly published: Pick<PublishedXpertAccessService, 'getAccessiblePublishedXpertForActor'>,
        @Inject(AgentMiddlewareRegistry) private readonly middlewares: Pick<AgentMiddlewareRegistry, 'get'>,
        @Inject(ProjectAccessRuntimeService) private readonly projects: Pick<ProjectAccessRuntimeService, 'assertAssistant'>,
        @InjectRepository(Xpert) private readonly assistants: Pick<Repository<Xpert>, 'createQueryBuilder'>
    ) {}

    async assertAccess(input: Parameters<AssistantMiddlewareAccessApi['assertAccess']>[0]): Promise<void> {
        const { actor, assistantId, scope } = input
        if (!actor.tenantId || !actor.organizationId || !actor.userId) {
            throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        }
        let xpert: Xpert
        if (scope.type === 'assistant') {
            xpert = await this.published.getAccessiblePublishedXpertForActor(assistantId, actor)
        } else if (scope.type === 'project' && scope.projectId) {
            // Project delegation intentionally does not require catalog/workspace visibility.
            // Reuse the Project domain's live membership + binding policy, including revocation.
            await this.projects.assertAssistant({ actor, assistantId, projectId: scope.projectId })
            // Read the requested published version, not a different version's middleware graph.
            // Background actors must still belong to the organization; never borrow RequestContext.
            xpert = await this.assistants.createQueryBuilder('xpert')
                .leftJoinAndSelect('xpert.agent', 'agent')
                .innerJoin(UserOrganization, 'actorMembership',
                    'actorMembership.tenantId = :tenantId AND actorMembership.organizationId = :organizationId AND actorMembership.userId = :userId AND actorMembership.isActive = :actorMembershipActive',
                    { userId: actor.userId, actorMembershipActive: true })
                .where('xpert.id = :assistantId', { assistantId })
                .andWhere('xpert.tenantId = :tenantId', { tenantId: actor.tenantId })
                .andWhere('xpert.organizationId = :organizationId', { organizationId: actor.organizationId })
                .andWhere('xpert.publishAt IS NOT NULL')
                .getOne()
            if (!xpert) throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        } else {
            throw new ForbiddenException(t('server-ai:Error.AssistantAccessForbidden'))
        }
        requireAssistantMiddleware(xpert, this.middlewares, input)
    }
}
