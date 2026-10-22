// Retry follows an execution-owned input boundary. Never substitute the thread's latest state.
import type { CheckpointTuple } from '@langchain/langgraph-checkpoint'
import type { IXpertAgentExecution } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import { CopilotCheckpointGetTupleQuery } from '../../copilot-checkpoint/queries/get-tuple.query'
import { readExecutionRecovery } from './execution-recovery.schema'
import { recoveryConflict } from './recovery-error'

export async function resolveRetryInputCheckpointId(
    queryBus: QueryBus,
    threadId: string | null | undefined,
    checkpointNs: string | null | undefined,
    checkpointId: string | null | undefined,
    options: { execution?: IXpertAgentExecution; requestedCheckpointId?: string; graphRevision?: string } = {}
): Promise<string> {
    const unavailable = () => recoveryConflict('conversation_recovery_unavailable', options.execution?.error)
    const recovery = readExecutionRecovery(options.execution?.metadata?.recovery)
    if (options.execution?.metadata?.recovery && !recovery) throw unavailable()
    if (recovery) {
        if (!recovery.input || recovery.input.threadId !== threadId || recovery.input.checkpointNs !== '')
            throw unavailable()
        if (options.graphRevision !== recovery.graphRevision)
            throw recoveryConflict('conversation_graph_changed', options.execution?.error)
        checkpointId = recovery.input.checkpointId
        checkpointNs = recovery.input.checkpointNs
    }
    if (!threadId || !checkpointId || (checkpointNs ?? '') !== '' || options.execution?.parentId) throw unavailable()
    const visited = new Set<string>()
    let currentCheckpointId = checkpointId
    while (currentCheckpointId) {
        if (visited.has(currentCheckpointId) || visited.size >= 10000) throw unavailable()
        visited.add(currentCheckpointId)
        const tuple = await queryBus.execute<CopilotCheckpointGetTupleQuery, CheckpointTuple | null>(
            new CopilotCheckpointGetTupleQuery({
                thread_id: threadId,
                checkpoint_ns: checkpointNs ?? '',
                checkpoint_id: currentCheckpointId
            })
        )
        if (!tuple) break
        const ref = tuple.config?.configurable
        if (
            ref?.thread_id !== threadId ||
            (ref.checkpoint_ns ?? '') !== (checkpointNs ?? '') ||
            ref.checkpoint_id !== currentCheckpointId
        )
            throw unavailable()
        if (tuple.metadata?.source === 'input') {
            if (options.requestedCheckpointId && options.requestedCheckpointId !== currentCheckpointId)
                throw unavailable()
            return currentCheckpointId
        }
        // A stored input boundary must itself be an input, never a nearby loop snapshot.
        if (recovery) throw unavailable()
        const parent = tuple.parentConfig?.configurable
        if (parent && (parent.thread_id !== threadId || (parent.checkpoint_ns ?? '') !== (checkpointNs ?? '')))
            throw unavailable()
        currentCheckpointId = parent?.checkpoint_id ?? null
    }
    throw unavailable()
}
