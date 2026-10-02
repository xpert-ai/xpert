/** Provider-neutral dependency waiting. A wait ending does not terminate its tasks. */
export type TaskWaitMode = 'any' | 'all'
/** `completed` means terminal, not necessarily successful. `timeout` is a historical durable-wait deadline. */
export type TaskWaitReason = 'completed' | 'pending' | 'attention' | 'timeout' | 'unavailable'

export interface TaskWaitRequest {
  /** Stable tool-call identity, assigned by the host rather than the model. */
  callId: string
  /** Distinct handles owned by the caller; the invocation adapter accepts at most 32. */
  taskIds: string[]
  /** Whether one terminal task or all terminal tasks satisfy this wait. */
  mode: TaskWaitMode
  /** Requested observation window, bounded by host policy; expiry returns pending, not an interrupt. */
  timeoutMs?: number
}

export interface TaskWaitResult<T> {
  reason: TaskWaitReason
  /** Latest observed states, including unfinished tasks when mode is `any`. */
  tasks: T[]
}

/** Host policy caps the requested observation window. */
export interface TaskWaitPolicy {
  /** Default initial observation window, in milliseconds. */
  inlineWaitMs: number
  /** Maximum duration of a single observation call, in milliseconds. */
  maxInlineWaitMs: number
  /** Interval between backend reads; each read must bound its own I/O. */
  pollIntervalMs: number
  /** Historical persisted wait deadline, independent of a new status-call duration. */
  maxWaitMs: number
  /** Historical grace period before an ambiguous outcome is reported unavailable. */
  unknownGraceMs: number
}

/** Domain adapters map their explicit states into these dependency states. */
export type TaskDependencyState = 'pending' | 'completed' | 'attention' | 'unknown'

export function taskWaitReason(states: readonly TaskDependencyState[], mode: TaskWaitMode): TaskWaitReason | undefined {
  if (states.length && (mode === 'all' ? states.every((state) => state === 'completed') : states.includes('completed')))
    return 'completed'
  if (states.includes('attention')) return 'attention'
  return undefined
}
