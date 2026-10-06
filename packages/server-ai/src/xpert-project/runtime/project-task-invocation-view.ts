import { IXpertProjectTaskExecution } from '@xpert-ai/contracts'
import { AgentInvocation } from '@xpert-ai/plugin-sdk'
import { EntityManager, In } from 'typeorm'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'

/** Read projection only. The legacy attempt status never replaces the full Invocation status. */
export function projectTaskInvocationView<T extends IXpertProjectTaskExecution>(
    attempt: T,
    invocation?: AgentInvocation
): T {
    if (!attempt.invocationId) return attempt
    const reference = invocation?.request.dispatch?.projectTask
    if (
        !invocation ||
        invocation.id !== attempt.invocationId ||
        reference?.taskExecutionId !== attempt.id ||
        reference.projectTaskId !== attempt.taskId ||
        reference.projectId !== attempt.projectId
    )
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
    return attempts.map((attempt) =>
        projectTaskInvocationView(
            attempt,
            records.find(
                (record) => record.id === attempt.invocationId && record.invocation.scope.projectId === scope.projectId
            )?.invocation
        )
    )
}
