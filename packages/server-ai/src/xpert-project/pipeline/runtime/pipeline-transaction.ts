import { XpertProject } from '../../entities/project.entity'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { assertPipelineCommandAuthority } from './pipeline-command-authority'
export { assertPipelineCommandAuthority } from './pipeline-command-authority'

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
    await lockPipelineProject(manager, context)
}

/** Configuration persistence takes the same Project lock without granting background execution. */
export async function lockPipelineProject(manager: import('typeorm').EntityManager, context: ProjectPipelineContext) {
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
