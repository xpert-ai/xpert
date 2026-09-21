import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IXpert } from '@xpert-ai/contracts'
import type { ProjectEnsureInput, ProjectEnsureResult } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { QueryBus } from '@nestjs/cqrs'
import { DeepPartial, IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectTypeService } from './project-type.service'
import { XpertProjectXpertBindingService } from './project-xpert-binding.service'
import { requiredProjectText, resolveProjectExternalXperts } from './project-external-assistants'

export interface ManagedProjectStore {
    repository: Repository<XpertProject>
    queryBus: QueryBus
    bindings: XpertProjectXpertBindingService
    types: XpertProjectTypeService
    initialize: (project: XpertProject) => Promise<unknown>
    create: (entity: DeepPartial<XpertProject>) => Promise<XpertProject>
    resolveXpert: (id: string) => Promise<IXpert>
}

/**
 * Reconcile the business-owned Project under its persisted ID and request scope.
 * Validate classification and required Assistants before writes; retries repair content
 * initialization while preserving existing Assistant connections and Project identity.
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
    const externalXperts = await resolveProjectExternalXperts(store.queryBus, xpert, input)
    const requiredXperts = [xpert, ...externalXperts].filter(
        (candidate, index, items) => items.findIndex((item) => store.bindings.isSameXpert(item, candidate)) === index
    )

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
        project = await store.create({
            id: projectId,
            ...classification,
            name,
            status: input.status,
            ownerId: user.id
        })
        project.xperts = requiredXperts
        project = await store.repository.save(project)
    } else {
        // Bid/business state is authoritative while existing Assistant
        // connections are preserved and de-duplicated.
        project.name = name
        project.status = input.status
        project.xperts ??= []
        await store.bindings.normalize(project)
        for (const requiredXpert of requiredXperts) {
            if (!store.bindings.contains(project, requiredXpert)) {
                project.xperts.push(requiredXpert)
            }
        }
        project = await store.repository.save(project)
    }

    // A prior attempt may have persisted the row before content initialization failed.
    await store.initialize(project)
    return {
        projectId: project.id,
        // Compatibility only: provisioning clients still carry a Workspace id,
        // but Project persistence and runtime no longer use it.
        workspaceId: input.workspaceId,
        xpertIds: project.xperts?.map((item) => item.id) ?? [xpert.id],
        operation
    }
}
