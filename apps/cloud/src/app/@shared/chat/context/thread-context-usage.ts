import { CHAT_EVENT_TYPE_THREAD_CONTEXT_USAGE, TAgentThreadContextUsageEvent } from '@xpert-ai/contracts'

export function isThreadContextUsageEvent(value: unknown): value is TAgentThreadContextUsageEvent {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === CHAT_EVENT_TYPE_THREAD_CONTEXT_USAGE &&
    'agentKey' in value &&
    typeof value.agentKey === 'string' &&
    (!('effectiveModel' in value) ||
      value.effectiveModel === undefined ||
      (!!value.effectiveModel &&
        typeof value.effectiveModel === 'object' &&
        'contextWindow' in value.effectiveModel &&
        typeof value.effectiveModel.contextWindow === 'number' &&
        Number.isFinite(value.effectiveModel.contextWindow) &&
        value.effectiveModel.contextWindow > 0 &&
        (!('model' in value.effectiveModel) ||
          value.effectiveModel.model === undefined ||
          typeof value.effectiveModel.model === 'string')))
  )
}

export function upsertThreadContextUsage(
  state: Record<string, TAgentThreadContextUsageEvent>,
  event: TAgentThreadContextUsageEvent
): Record<string, TAgentThreadContextUsageEvent> {
  return {
    ...(state ?? {}),
    [event.agentKey]: event
  }
}
