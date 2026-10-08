import type { ExecutionActivityBatch, ExecutionActivityCheckpoint } from '@xpert-ai/contracts'

/** Optional, invocation-bound public activity sink. Does not alter execution or business status. */
export interface AgentActivityRecorder {
  readCheckpoint(): Promise<ExecutionActivityCheckpoint>
  append(batch: ExecutionActivityBatch): Promise<ExecutionActivityCheckpoint>
}
