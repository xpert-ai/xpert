import { In, type EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import type { ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'

/** Terminal native evidence alone cannot settle later conversation turns or delegated work. */
export async function assertRecoveryQuiescent(
    manager: EntityManager,
    c: ProjectPipelineContext,
    row: ProjectPipelineOperationEntity
) {
    const conversationId = row.assistantIntent?.conversationId
    if (!conversationId) return
    const { projectId: _projectId, ...scope } = projectionScope(c)
    const threads = await manager.find(ChatConversationThread, {
        where: { ...scope, conversationId },
        ...(manager.queryRunner?.isTransactionActive ? { lock: { mode: 'pessimistic_read' as const } } : {})
    })
    if (
        !threads.length ||
        threads.some((thread) => thread.runControl || !['idle', 'error', 'interrupted'].includes(thread.status))
    )
        throw pipelineProjectionConflict('RECOVERY_EXECUTION_NOT_SETTLED')
    const attempts = await manager.find(XpertProjectTaskExecution, {
        where: { ...projectionScope(c), conversationId }
    })
    if (attempts.some((item) => item.dispatchState === 'pending'))
        throw pipelineProjectionConflict('RECOVERY_EXECUTION_NOT_SETTLED')
    const ids = attempts.flatMap((item) => (item.invocationId ? [item.invocationId] : []))
    if (!ids.length) return
    const invocations = await manager.find(AgentInvocationEntity, { where: { ...scope, id: In(ids) } })
    if (
        new Set(invocations.map((item) => item.id)).size !== new Set(ids).size ||
        invocations.some(
            (item) =>
                !['succeeded', 'failed', 'cancelled'].includes(item.invocation.status) ||
                item.invocation.controlEvidence?.state !== 'settled'
        )
    )
        throw pipelineProjectionConflict('RECOVERY_EXECUTION_NOT_SETTLED')
}
