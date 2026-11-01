// Retry follows an execution-owned input boundary. Never substitute the thread's latest state.
import type { IXpertAgentExecution } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import {
    CopilotCheckpointGetMetadataQuery,
    CopilotCheckpointMetadata
} from '../../copilot-checkpoint/queries/get-metadata.query'
import { readExecutionRecovery } from './execution-recovery.schema'
import { recoveryConflict } from './recovery-error'

/**
 * 解析并校验本次执行所属的根图输入检查点，供显式重试使用。
 * recovery.input 是唯一可信边界，不能用传入的 checkpointId 或线程最新状态替代；
 * 客户端指定的 requestedCheckpointId 也必须与该边界一致。
 * 调用方须按保存的指纹格式计算当前流程的 graphRevision，不匹配时拒绝恢复。
 * 旧记录缺少恢复元数据时无法证明兼容性，安全拒绝，不回溯猜测检查点。
 * 读取后再次核对线程、根命名空间和 source=input；此函数仅校验，不执行工具。
 */
export async function resolveRetryInputCheckpointId(
    queryBus: QueryBus,
    threadId: string | null | undefined,
    checkpointNs: string | null | undefined,
    checkpointId: string | null | undefined,
    options: { execution?: IXpertAgentExecution; requestedCheckpointId?: string; graphRevision?: string } = {}
): Promise<string> {
    const unavailable = () => recoveryConflict('conversation_recovery_unavailable', options.execution?.error)
    const recovery = readExecutionRecovery(options.execution?.metadata?.recovery)
    // Without a saved graph fingerprint there is no proof that an old checkpoint fits the current workflow.
    if (!recovery?.input) throw unavailable()
    if (
        !threadId ||
        (checkpointNs ?? '') !== '' ||
        options.execution?.parentId ||
        recovery.input.threadId !== threadId ||
        recovery.input.checkpointNs !== ''
    )
        throw unavailable()
    if (options.graphRevision !== recovery.graphRevision)
        throw recoveryConflict('conversation_graph_changed', options.execution?.error)
    checkpointId = recovery.input.checkpointId
    if (options.requestedCheckpointId && options.requestedCheckpointId !== checkpointId) throw unavailable()
    const checkpoint = await queryBus.execute<CopilotCheckpointGetMetadataQuery, CopilotCheckpointMetadata | null>(
        new CopilotCheckpointGetMetadataQuery({ thread_id: threadId, checkpoint_ns: '', checkpoint_id: checkpointId })
    )
    const ref = checkpoint?.config?.configurable
    if (
        ref?.thread_id !== threadId ||
        (ref.checkpoint_ns ?? '') !== '' ||
        ref.checkpoint_id !== checkpointId ||
        checkpoint.metadata?.source !== 'input'
    )
        throw unavailable()
    return checkpointId
}
