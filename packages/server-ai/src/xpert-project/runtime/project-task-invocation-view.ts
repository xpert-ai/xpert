import { IXpertProjectTaskExecution } from '@xpert-ai/contracts'
import { AgentInvocation, projectPipelineInvocationScopeSchema } from '@xpert-ai/plugin-sdk'
import { EntityManager, In } from 'typeorm'
import { ProjectPipelineTaskLinkEntity } from '../pipeline/persistence/pipeline.entity'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'

/** Read projection only. The legacy attempt status never replaces the full Invocation status. */
export function projectTaskInvocationView<T extends IXpertProjectTaskExecution>(
    attempt: T,
    invocation?: AgentInvocation,
    pipelineLink?: Pick<ProjectPipelineTaskLinkEntity, 'projectId' | 'taskId' | 'nodeInstanceId'>
): T {
    if (!attempt.invocationId) return attempt
    const reference = invocation?.request.dispatch?.projectTask
    const pipeline =
        invocation?.scope.callerType === 'project_pipeline'
            ? projectPipelineInvocationScopeSchema.safeParse(invocation.scope)
            : undefined
    const pipelineMatches =
        pipeline?.success &&
        pipeline.data.projectId === attempt.projectId &&
        pipeline.data.pipelineOrigin.operationId === attempt.sourceKey &&
        invocation.request.callId === attempt.sourceKey &&
        pipelineLink?.projectId === attempt.projectId &&
        pipelineLink.taskId === attempt.taskId &&
        pipelineLink.nodeInstanceId === pipeline.data.pipelineOrigin.nodeInstanceId
    const dispatchMatches =
        reference?.taskExecutionId === attempt.id &&
        reference.projectTaskId === attempt.taskId &&
        reference.projectId === attempt.projectId
    if (!invocation || invocation.id !== attempt.invocationId || !(pipeline ? pipelineMatches : dispatchMatches))
        return { ...attempt, invocationStatus: attempt.dispatchState === 'pending' ? 'queued' : 'unknown' }
    const status =
        invocation.status === 'succeeded' || invocation.status === 'failed' || invocation.status === 'cancelled'
            ? invocation.status
            : invocation.handle
              ? 'running'
              : 'queued'
    return {
        ...attempt,
        status,
        invocationStatus: invocation.status,
        runtimeProvider: invocation.request.target.provider,
        runtimeToolId: invocation.handle?.runner?.tool.id,
        runtimeStartedAt: invocation.progress?.startedAt ?? null,
        runtimeCompletedAt: ['succeeded', 'failed', 'cancelled'].includes(invocation.status)
            ? invocation.updatedAt
            : null
    }
}

export async function observeProjectTaskInvocations<T extends IXpertProjectTaskExecution>(
    manager: EntityManager,
    scope: { projectId: string; tenantId: string; organizationId?: string | null },
    attempts: T[]
): Promise<T[]> {
    const ids = attempts.flatMap((attempt) => (attempt.invocationId ? [attempt.invocationId] : []))
    if (!ids.length) return attempts
    if (!scope.tenantId || !scope.organizationId) return attempts.map((attempt) => projectTaskInvocationView(attempt))
    const records = await manager.getRepository(AgentInvocationEntity).find({
        where: {
            id: In(ids),
            tenantId: scope.tenantId,
            organizationId: scope.organizationId
        }
    })
    const pipelineNodeIds = records.flatMap((record) => {
        const parsed = projectPipelineInvocationScopeSchema.safeParse(record.invocation.scope)
        return parsed.success && parsed.data.projectId === scope.projectId
            ? [parsed.data.pipelineOrigin.nodeInstanceId]
            : []
    })
    const links = pipelineNodeIds.length
        ? await manager.getRepository(ProjectPipelineTaskLinkEntity).find({
              where: { ...scope, nodeInstanceId: In(pipelineNodeIds) }
          })
        : []
    return attempts.map((attempt) =>
        projectTaskInvocationView(
            attempt,
            records.find(
                (record) => record.id === attempt.invocationId && record.invocation.scope.projectId === scope.projectId
            )?.invocation,
            links.find((link) => link.taskId === attempt.taskId)
        )
    )
}
