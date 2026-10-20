import { XpertProject } from '../../entities/project.entity'
import { RequestContext, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

/** Managed Queue restores a business user, not a credential audience. Reject scoped delegation until it can be durably reauthorized. */
export function assertPipelineCommandAuthority() {
    if (RequestContext.currentApiPrincipal()) throw pipelineProjectionConflict('PIPELINE_SCOPED_DELEGATION_UNAVAILABLE')
}

export function managedAudit(context: ProjectPipelineContext) {
    return {
        projectId: context.projectId,
        tenantId: context.actor.tenantId,
        organizationId: context.actor.organizationId ?? null,
        createdById: context.actor.userId
    }
}
export async function lockManagedProject(manager: import('typeorm').EntityManager, context: ProjectPipelineContext) {
    assertPipelineCommandAuthority()
    await manager.query("SET LOCAL lock_timeout = '2s'")
    await manager.query("SET LOCAL statement_timeout = '10s'")
    await manager.findOneOrFail(XpertProject, {
        where: {
            id: context.projectId,
            tenantId: context.actor.tenantId,
            organizationId: projectionScope(context).organizationId
        },
        lock: { mode: 'pessimistic_write' }
    })
}
