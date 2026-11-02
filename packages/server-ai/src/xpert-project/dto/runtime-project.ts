import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { IXpertProject } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { appUserRuntimeAssistant } from '../../xpert/runtime-dto'

/** Project presentation never includes model bindings, instructions or nested authoring entities. */
export function runtimeProject<T extends Partial<IXpertProject>>(project: T) {
    if (RequestContext.hasPermission(AIPermissionsEnum.XPERT_VIEW)) return project
    return {
        id: project.id, name: project.name, description: project.description, avatar: project.avatar,
        status: project.status, createdAt: project.createdAt, updatedAt: project.updatedAt,
        ownerId: project.ownerId, organizationId: project.organizationId,
        applicationKey: project.applicationKey, projectTypeKey: project.projectTypeKey,
        projectTypeSnapshot: project.projectTypeSnapshot,
        xperts: project.xperts?.map(appUserRuntimeAssistant)
    }
}
