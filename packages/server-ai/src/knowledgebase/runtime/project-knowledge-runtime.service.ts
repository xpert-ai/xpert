import { t } from 'i18next'
import { ForbiddenException, ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { KnowledgebasePermission, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { ProjectKnowledgeRuntimeCapability, RequestContext, type ProjectKnowledgeApi, type ContentResourceReference } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { RuntimeCapabilityProvider } from '../../shared/runtime'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { ProjectAccessRuntimeService } from '../../xpert-project/services/project-access-runtime.service'
import { XpertProject } from '../../xpert-project/entities/project.entity'

@Injectable()
@RuntimeCapabilityProvider(ProjectKnowledgeRuntimeCapability)
export class ProjectKnowledgeRuntimeService implements ProjectKnowledgeApi {
    constructor(
        @InjectRepository(Knowledgebase) private readonly repository: Repository<Knowledgebase>,
        private readonly knowledgebases: KnowledgebaseService,
        private readonly projects: ProjectAccessRuntimeService
    ) {}
    async ensureBinding(input: Parameters<ProjectKnowledgeApi['ensureBinding']>[0]) {
        const { actor, projectId } = input
        // The existing knowledge pipeline uses request/job context. Never silently create under another actor.
        if (RequestContext.currentTenantId() !== actor.tenantId || RequestContext.currentUserId() !== actor.userId ||
            RequestContext.getOrganizationId() !== actor.organizationId)
            throw new ForbiddenException(t('server-ai:Error.ContentAccessDenied'))
        await this.projects.assertManage({ actor, projectId })
        const resource: ContentResourceReference = { providerKey: 'platform.project', resourceId: projectId }
        const name = `project-${projectId}`
        const where = { tenantId: actor.tenantId, organizationId: actor.organizationId, name }
        let kb = await this.repository.findOneBy(where)
        if (!kb) {
            try {
                kb = await this.knowledgebases.createForResource({
                    name, description: input.title, type: KnowledgebaseTypeEnum.Standard,
                    permission: KnowledgebasePermission.Private, recall: { mode: 'keyword', topK: 8 }
                }, resource)
            } catch (error) {
                // Concurrent first use may win the unique name; never adopt an unrelated library.
                if (!(await this.repository.findOneBy(where))) throw error
            }
        }
        // A pre-existing unrelated library with the same name is never adopted.
        const current = await this.repository.findOneByOrFail(where)
        if (current.resourceRef?.providerKey !== resource.providerKey || current.resourceRef.resourceId !== resource.resourceId)
            throw new ConflictException(t('server-ai:Error.ProjectKnowledgeBindingConflict'))
        await this.repository.manager.transaction(async (manager) => {
            const project = await manager.getRepository(XpertProject).findOneOrFail({
                where: { id: input.projectId, tenantId: where.tenantId, organizationId: where.organizationId },
                lock: { mode: 'pessimistic_write' }
            })
            const relation = manager.createQueryBuilder().relation(XpertProject, 'knowledges').of(project.id)
            if (!(await relation.loadMany<Knowledgebase>()).some((library) => library.id === current.id))
                await relation.add(current.id)
        })
        return { knowledgebaseId: current.id }
    }
}
