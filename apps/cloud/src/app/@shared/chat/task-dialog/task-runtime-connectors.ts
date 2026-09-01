import { STATE_VARIABLE_HUMAN } from '@xpert-ai/contracts'
import type { RuntimeCapabilitiesSelection, TXpertChatState } from '@xpert-ai/chatkit-types'

export function readTaskConnectorBindingIds(value: unknown): string[] {
  if (!isObjectValue(value)) {
    return []
  }

  const human = Reflect.get(value, STATE_VARIABLE_HUMAN)
  if (!isObjectValue(human)) {
    return []
  }

  const runtimeCapabilities = Reflect.get(human, 'runtimeCapabilities')
  if (!isObjectValue(runtimeCapabilities)) {
    return []
  }

  const connectors = Reflect.get(runtimeCapabilities, 'connectors')
  if (!isObjectValue(connectors)) {
    return []
  }

  const bindingIds = Reflect.get(connectors, 'bindingIds')
  if (!Array.isArray(bindingIds)) {
    return []
  }

  return [
    ...new Set(bindingIds.filter((item): item is string => typeof item === 'string').map((item) => item.trim()))
  ].filter(Boolean)
}

export function withTaskConnectorBindingIds(
  state: TXpertChatState | null | undefined,
  bindingIds: string[]
): TXpertChatState {
  const human = state?.[STATE_VARIABLE_HUMAN]
  const currentSelection = human?.runtimeCapabilities
  const normalizedBindingIds = [...new Set(bindingIds.map((item) => item.trim()))].filter(Boolean)

  if (!currentSelection && !normalizedBindingIds.length) {
    return state ?? {}
  }

  if (currentSelection && Reflect.get(currentSelection, 'inheritUnselected') === true && !normalizedBindingIds.length) {
    const { runtimeCapabilities: _runtimeCapabilities, ...remainingHuman } = human
    return {
      ...(state ?? {}),
      [STATE_VARIABLE_HUMAN]: remainingHuman
    }
  }

  const runtimeCapabilities: RuntimeCapabilitiesSelection = {
    ...(currentSelection ?? {}),
    mode: 'allowlist',
    skills: currentSelection?.skills ?? { ids: [] },
    plugins: currentSelection?.plugins ?? { nodeKeys: [] },
    ...(currentSelection?.subAgents ? { subAgents: currentSelection.subAgents } : {}),
    ...(!currentSelection ? { inheritUnselected: true as const } : {}),
    connectors: {
      bindingIds: normalizedBindingIds
    }
  }

  return {
    ...(state ?? {}),
    [STATE_VARIABLE_HUMAN]: {
      ...(human ?? {}),
      runtimeCapabilities
    }
  }
}

function isObjectValue(value: unknown): value is object {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
