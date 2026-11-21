import { invocationCanRelease } from '../../agent-invocation/invocation-control-evidence'
import { IXpertProjectTaskExecution } from '@xpert-ai/contracts'
import { AgentInvocation, projectPipelineInvocationScopeSchema } from '@xpert-ai/plugin-sdk'
import { EntityManager, In } from 'typeorm'
import { ProjectPipelineTaskLinkEntity } from '../pipeline/persistence/pipeline.entity'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { sameInvocationData } from '../../agent-invocation/invocation-runtime'
import { reviewReport } from './project-task-evidence'

/** Read projection only. The legacy attempt status never replaces the full Invocation status. */
export function projectTaskInvocationView<T extends IXpertProjectTaskExecution>(
    attempt: T,
    invocation?: AgentInvocation,
    pipelineLink?: Pick<ProjectPipelineTaskLinkEntity, 'projectId' | 'taskId' | 'nodeInstanceId'>
): T {
    if (!attempt.invocationId) return { ...attempt, reviewReportAvailable: false }
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
        return {
            ...attempt,
            reviewReportAvailable: false,
            invocationStatus: attempt.dispatchState === 'pending' ? 'queued' : 'unknown'
        }
    const released = invocationCanRelease(invocation)
    const status = released ? invocation.status : invocation.handle ? 'running' : 'queued'
    // Runtime success is not approval. Only a settled review of this exact pinned candidate exposes a report.
    const report =
        attempt.purpose?.type === 'review' &&
        status === 'succeeded' &&
        dispatchMatches &&
        invocation.scope.projectId === attempt.projectId &&
        sameInvocationData(reference.purpose, attempt.purpose)
            ? reviewReport(attempt.purpose, invocation.result?.text)
            : null
    return {
        ...attempt,
        reviewReportAvailable: Boolean(report),
        status,
        invocationStatus: invocation.status === 'cancelled' && !released ? 'cancelling' : invocation.status,
        runtimeProvider: invocation.request.target.provider,
        runtimeToolId: invocation.handle?.runner?.tool.id,
        runtimeStartedAt: invocation.progress?.startedAt ?? null,
        runtimeCompletedAt: released ? (invocation.completedAt ?? null) : null
    }
}

export async function observeProjectTaskInvocations<T extends IXpertProjectTaskExecution>(
    manager: EntityManager,
    scope: { projectId: string; tenantId: string; organizationId?: string | null },
    attempts: T[],
    compact = false
): Promise<T[]> {
    const ids = attempts.flatMap((attempt) => (attempt.invocationId ? [attempt.invocationId] : []))
    if (!ids.length) return attempts.map((attempt) => projectTaskInvocationView(attempt))
    if (!scope.tenantId || !scope.organizationId) return attempts.map((attempt) => projectTaskInvocationView(attempt))
    const where = { id: In(ids), tenantId: scope.tenantId, organizationId: scope.organizationId }
    const records = compact
        ? await manager
              .getRepository(AgentInvocationEntity)
              .createQueryBuilder('record')
              .select('record.id', 'id')
              // Input and non-review result bodies are unnecessary for status observation. Keep control evidence intact.
              .addSelect(
                  `jsonb_set(record.invocation - 'result', '{request,input}', '{}'::jsonb) ||
                  CASE WHEN record.invocation #>> '{request,dispatch,projectTask,purpose,type}' = 'review'
                  THEN jsonb_build_object('result', jsonb_build_object('text', record.invocation #> '{result,text}'))
                  ELSE '{}'::jsonb END`,
                  'invocation'
              )
              .where(where)
              .getRawMany<{ id: string; invocation: AgentInvocation }>()
        : await manager.getRepository(AgentInvocationEntity).find({ where })
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
    const invocations = new Map(
        records
            .filter((record) => record.invocation.scope.projectId === scope.projectId)
            .map((record) => [record.id, record.invocation])
    )
    const taskLinks = new Map(links.map((link) => [`${link.taskId}:${link.nodeInstanceId}`, link]))
    return attempts.map((attempt) => {
        const invocation = invocations.get(attempt.invocationId)
        // A logical task may have links in several rounds; match this execution's exact node.
        const nodeId = invocation?.scope.pipelineOrigin?.nodeInstanceId
        return projectTaskInvocationView(attempt, invocation, taskLinks.get(`${attempt.taskId}:${nodeId}`))
    })
}
