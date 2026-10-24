import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IXpert } from '@xpert-ai/contracts'
import type { ProjectEnsureInput, ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { QueryBus } from '@nestjs/cqrs'
import { DeepPartial, IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTypeService } from './project-type.service'
import { requiredProjectText, validateProjectExternalAssistants } from './project-external-assistants'

export interface ManagedProjectStore {
    repository: Repository<XpertProject>
    queryBus: QueryBus
    types: XpertProjectTypeService
    initialize: (project: XpertProject) => Promise<unknown>
    create: (entity: DeepPartial<XpertProject>, roots: IXpert[]) => Promise<XpertProject>
    resolveXpert: (id: string) => Promise<IXpert>
}

/**
 * Reconcile the business-owned Project under its persisted ID and request scope.
 * Validate classification and required Assistants before writes; retries repair content
 * initialization while preserving independently managed membership and Project identity.
 */
export async function ensureManagedProject(
    store: ManagedProjectStore,
    input: ProjectEnsureInput
): Promise<ProjectEnsureResult> {
    const projectId = requiredProjectText(input.projectId, 'projectId', 100)
    const xpertId = requiredProjectText(input.xpertId, 'xpertId', 100)
    const name = requiredProjectText(input.name, 'name', 240)
    const user = RequestContext.currentUser()
    if (!user?.id || !user.tenantId) {
        throw new ForbiddenException(
            t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
        )
    }

    const organizationId = RequestContext.getOrganizationId()
    const xpert = await store.resolveXpert(xpertId)
    if ((xpert.organizationId ?? null) !== (organizationId ?? null)) {
        throw new BadRequestException(
            t('server-ai:Error.ProjectXpertOrganizationMismatch', {
                defaultValue: 'The Xpert must belong to the Project Organization'
            })
        )
    }
    const assistantBindings = await validateProjectExternalAssistants(store.queryBus, xpert, input)

    // Tenant and organization participate in lookup so retries cannot adopt
    // a same-id Project from a different security boundary.
    let project = await store.repository.findOne({
        where: {
            id: projectId,
            tenantId: user.tenantId,
            organizationId: organizationId ?? IsNull()
        },
        relations: ['xperts']
    })
    const classification = await store.types.forEnsure(project, input.projectType, xpert, projectId, {
        name,
        status: input.status
    })
    const operation = project ? 'updated' : 'created'
    if (project && project.ownerId !== user.id) {
        throw new ForbiddenException(
            t('server-ai:Error.ProjectOwnerSyncRequired', {
                defaultValue: 'Only the Project owner can synchronize this Project'
            })
        )
    }
    if (!project) {
        project = await store.create(
            {
                id: projectId,
                ...classification,
                name,
                status: input.status,
                ownerId: user.id
            },
            [xpert]
        )
    } else {
        // Reconcile a conversation-created name once. Subsequent provisioning
        // must preserve user naming, including changes before the first ensure.
        const bootstrap = project.settings?.conversationBootstrap
        const entityManaged = project.projectTypeSnapshot?.binding.kind === 'entity'
        if (entityManaged || !bootstrap || (!bootstrap.nameResolved && project.name === bootstrap.initialName))
            project.name = name
        if (bootstrap) bootstrap.nameResolved = true
        project.status = input.status
        // Never save a loaded relation snapshot: a concurrent explicit removal
        // must not be restored by business metadata synchronization.
        const { xperts, ...metadata } = project
        project = { ...(await store.repository.save(metadata)), xperts }
    }

    // A prior attempt may have persisted the row before content initialization failed.
    if (operation === 'updated') await store.initialize(project)
    return {
        projectId: project.id,
        // Compatibility only: provisioning clients still carry a Workspace id,
        // but Project persistence and runtime no longer use it.
        workspaceId: input.workspaceId,
        xpertIds: project.xperts?.map((item) => item.id) ?? [],
        assistantBindings,
        operation
    }
}
