import type { RunnableConfig } from '@langchain/core/runnables'

export type ThreadCheckpointReference = { threadId: string; checkpointNs: string; checkpointId: string }

export function isThreadCheckpointReference(value: unknown): value is ThreadCheckpointReference {
    return Boolean(
        value &&
        typeof value === 'object' &&
        'threadId' in value &&
        typeof value.threadId === 'string' &&
        'checkpointNs' in value &&
        typeof value.checkpointNs === 'string' &&
        'checkpointId' in value &&
        typeof value.checkpointId === 'string' &&
        value.checkpointId
    )
}

// Resolve the pinned snapshot at the saver boundary. Passing checkpoint_id to
// Pregel itself selects replay and discards completed parallel pending writes.
export function checkpointReadConfig(config: RunnableConfig): RunnableConfig {
    const c = config.configurable ?? {}
    const reference: unknown = c.xpertResumeCheckpoint
    if (
        c.checkpoint_id ||
        !isThreadCheckpointReference(reference) ||
        reference.threadId !== c.thread_id ||
        reference.checkpointNs !== (c.checkpoint_ns ?? '')
    )
        return config
    return { ...config, configurable: { ...c, checkpoint_id: reference.checkpointId } }
}
