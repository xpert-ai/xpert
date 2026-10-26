import type { TaskControlRef, TaskControlIntent } from '@xpert-ai/contracts'

/** A handler may check control at a safe boundary; abort alone is not an exit receipt. */
export interface TaskControlContext {
  reference: TaskControlRef
  signal: AbortSignal
  desired(): Promise<TaskControlIntent>
}
