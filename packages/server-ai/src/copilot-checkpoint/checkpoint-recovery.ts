// Invariants: only a live root writer can record recovery. The checkpoint, its execution
// reference and candidate-branch admission commit together; no latest-checkpoint guessing.
import type { RunnableConfig } from '@langchain/core/runnables'
import type { CheckpointMetadata } from '@langchain/langgraph-checkpoint'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { EntityManager, IsNull } from 'typeorm'
import { z } from 'zod'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { readRunLease } from '../chat-conversation/thread-run-lease'
import { recoveryConflict } from '../chat-conversation/recovery/recovery-error'
import { readExecutionRecovery } from '../chat-conversation/recovery/execution-recovery.schema'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'

const writerSchema = z.object({
    executionId: z.string().min(1),
    rootExecutionId: z.string().min(1),
    thread_id: z.string().min(1),
    checkpoint_ns: z.literal('').default(''),
    tenantId: z.string().min(1),
    organizationId: z.string().nullish(),
    xpertGraphRevision: z.string().min(1),
    xpertRetryInputCheckpointId: z.string().min(1).optional()
})
type Writer = {
    executionId: string
    rootExecutionId: string
    thread_id: string
    checkpoint_ns: ''
    tenantId: string
    organizationId?: string | null
    xpertGraphRevision: string
    xpertRetryInputCheckpointId?: string
}
export function checkpointRecoveryWriter(config: RunnableConfig): Writer | null {
    const parsed = writerSchema.safeParse(config.configurable)
    return parsed.success && parsed.data.executionId === parsed.data.rootExecutionId ? (parsed.data as Writer) : null
}

export async function persistRecoveryCheckpoint(
    manager: EntityManager,
    writer: Writer,
    row: CopilotCheckpoint,
    metadata: CheckpointMetadata
) {
    const scope = { tenantId: writer.tenantId, organizationId: writer.organizationId ?? IsNull() }
    const thread = await manager.findOne(ChatConversationThread, {
        where: { ...scope, threadId: writer.thread_id },
        lock: { mode: 'pessimistic_write' }
    })
    const lease = readRunLease(thread?.metadata)
    if (
        !thread ||
        thread.runControl?.executionId !== writer.executionId ||
        !['busy', 'pausing'].includes(thread.status) ||
        (lease && Date.parse(lease.expiresAt) <= Date.now())
    )
        throw recoveryConflict('conversation_recovery_unavailable')
    if (
        thread.runControl.graphRevision !== writer.xpertGraphRevision ||
        (thread.metadata.forkGraphRevision && thread.metadata.forkGraphRevision !== writer.xpertGraphRevision)
    )
        throw recoveryConflict('conversation_graph_changed', thread.error, thread.parentThreadId)
    const execution = await manager.findOne(XpertAgentExecution, {
        where: { ...scope, id: writer.executionId, threadId: writer.thread_id },
        lock: { mode: 'pessimistic_write' }
    })
    if (
        !execution ||
        ![XpertAgentExecutionStatusEnum.RUNNING, XpertAgentExecutionStatusEnum.PENDING].includes(execution.status)
    )
        throw recoveryConflict('conversation_recovery_unavailable', execution?.error)
    const latest = { threadId: writer.thread_id, checkpointNs: '', checkpointId: row.checkpoint_id }
    const previous = readExecutionRecovery(execution.metadata?.recovery)
    if (
        previous &&
        (previous.graphRevision !== writer.xpertGraphRevision || previous.latest.threadId !== writer.thread_id)
    )
        throw recoveryConflict('conversation_graph_changed', execution.error)
    const input =
        metadata.source === 'input'
            ? latest
            : (previous?.input ??
              (writer.xpertRetryInputCheckpointId
                  ? { ...latest, checkpointId: writer.xpertRetryInputCheckpointId }
                  : undefined))
    await manager.upsert(CopilotCheckpoint, row, {
        conflictPaths: ['organizationId', 'thread_id', 'checkpoint_ns', 'checkpoint_id']
    })
    await manager.update(
        XpertAgentExecution,
        { ...scope, id: execution.id },
        {
            checkpointId: row.checkpoint_id,
            checkpointNs: '',
            metadata: {
                ...execution.metadata,
                recovery: {
                    version: 1,
                    graphRevision: writer.xpertGraphRevision,
                    latest,
                    ...(input ? { input } : {})
                }
            }
        }
    )
    const admission = thread.metadata.editAdmission
    if (admission?.state !== 'pending') return
    if (!input) throw recoveryConflict('conversation_recovery_unavailable', thread.error, thread.parentThreadId)
    const conversation = await manager.findOne(ChatConversation, {
        where: { ...scope, id: thread.conversationId },
        lock: { mode: 'pessimistic_write' }
    })
    if (
        !conversation ||
        conversation.threadId !== admission.workingThreadId ||
        (conversation.workingThreadRevision ?? 0) !== admission.workingThreadRevision
    )
        throw recoveryConflict('conversation_branch_selection_changed')
    conversation.threadId = thread.threadId
    conversation.workingThreadRevision = (conversation.workingThreadRevision ?? 0) + 1
    conversation.status = thread.status
    conversation.error = null
    conversation.operation = null
    await manager.save(conversation)
    thread.metadata = { ...thread.metadata, editAdmission: { ...admission, state: 'admitted' } }
    await manager.save(thread)
}
