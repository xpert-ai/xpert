// Project identity and initial membership commit together, before filesystem setup.
// Creation retries repair content without reconstructing independently managed members.
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IXpert, IXpertProject } from '@xpert-ai/contracts'
import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import { omit } from 'lodash'
import type { DeepPartial, Repository } from 'typeorm'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'

interface ProjectCreationStore {
    repository: Repository<XpertProject>
    bindings: XpertProjectXpertBindingService
    create: (entity: DeepPartial<XpertProject>) => Promise<XpertProject>
    initialize: (project: XpertProject) => Promise<unknown>
}

export async function createProjectWithAssistants(
    store: ProjectCreationStore,
    entity: DeepPartial<XpertProject>,
    roots: IXpert[]
): Promise<XpertProject> {
    const members = await store.bindings.resolveInitialMembers(roots, {
        tenantId: RequestContext.currentTenantId(),
        organizationId: RequestContext.getOrganizationId()
    })
    const settings = entity.settings as IXpertProject['settings'] | undefined
    if (entity.id) {
        const project = store.repository.create({
            ...omit(entity, ['workspace', 'workspaceId', 'xperts', 'members', 'memberships', 'toolsets', 'knowledges']),
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            ownerId: RequestContext.currentUserId(),
            createdById: RequestContext.currentUserId()
        })
        try {
            await store.repository.manager.transaction(async (manager) => {
                await manager.getRepository(XpertProject).insert(project)
                if (members.length) {
                    await manager
                        .createQueryBuilder()
                        .relation(XpertProject, 'xperts')
                        .of(project.id)
                        .add(members.map((member) => member.id))
                }
            })
            project.xperts = members
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
                throw new ConflictException(t('server-ai:Error.ProjectTypeConflict'))
            }
            throw error
        }
        await store.initialize(project)
        return project
    }
    const project = await store.create({
        ...omit(entity, ['workspace', 'workspaceId', 'xperts', 'members', 'memberships', 'toolsets', 'knowledges']),
        ...(settings
            ? {
                  settings: {
                      instruction: settings.instruction ?? '',
                      mode: settings.mode,
                      managementMode: settings.managementMode
                  }
              }
            : {}),
        ownerId: RequestContext.currentUserId(),
        xperts: members.map((member) => ({ id: member.id }))
    })
    await store.initialize(project)
    return project
}
