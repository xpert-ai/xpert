import { TThreadContextUsageEvent } from '../../../@core'

export function isThreadContextUsageEvent(value: unknown): value is TThreadContextUsageEvent {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as TThreadContextUsageEvent).type === 'thread_context_usage' &&
    typeof (value as TThreadContextUsageEvent).agentKey === 'string'
  )
}

export function upsertThreadContextUsage(
  state: Record<string, TThreadContextUsageEvent>,
  event: TThreadContextUsageEvent
): Record<string, TThreadContextUsageEvent> {
  return {
    ...(state ?? {}),
    [event.agentKey]: event
  }
}
