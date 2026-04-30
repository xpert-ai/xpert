import { type ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'

export type ClawXpertSandboxPreviewLogEvent = Parameters<NonNullable<ChatKitEventHandlers['onLog']>>[0]
export type ClawXpertSandboxPreviewEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0]

const SANDBOX_SERVICE_START_TOOL_NAME = 'sandbox_service_start'
const TOOL_EVENT_NESTED_KEYS = [
  'data',
  'item',
  'payload',
  'content',
  'detail',
  'message',
  'toolCall',
  'toolCalls',
  'tool_calls',
  'call'
] as const

export function shouldOpenSandboxPreviewFromEffectEvent(event: ClawXpertSandboxPreviewEffectEvent) {
  return event.name === SANDBOX_SERVICE_START_TOOL_NAME || hasSandboxServiceStartToolEvent(event)
}

export function shouldOpenSandboxPreviewFromLogEvent(event: ClawXpertSandboxPreviewLogEvent) {
  return event.name === SANDBOX_SERVICE_START_TOOL_NAME || hasSandboxServiceStartToolEvent(event)
}

function hasSandboxServiceStartToolEvent(value: unknown, visited = new Set<object>()): boolean {
  if (!value) {
    return false
  }

  if (Array.isArray(value)) {
    const tuplePayload =
      value.length >= 2 && value[0] === 'log' ? hasSandboxServiceStartToolEvent(value[1], visited) : false
    if (tuplePayload) {
      return true
    }

    for (const item of value) {
      if (hasSandboxServiceStartToolEvent(item, visited)) {
        return true
      }
    }

    return false
  }

  if (!isObjectLike(value)) {
    return false
  }

  if (visited.has(value)) {
    return false
  }
  visited.add(value)

  if (isSandboxServiceStartToolPayload(value)) {
    return true
  }

  for (const key of TOOL_EVENT_NESTED_KEYS) {
    if (hasSandboxServiceStartToolEvent(readObjectProperty(value, key), visited)) {
      return true
    }
  }

  return false
}

function isSandboxServiceStartToolPayload(value: object) {
  const tool =
    readStringProperty(value, 'tool') ??
    readStringProperty(value, 'toolName') ??
    readStringProperty(value, 'actionName')
  if (tool === SANDBOX_SERVICE_START_TOOL_NAME) {
    return true
  }

  const name = readStringProperty(value, 'name')
  return name === SANDBOX_SERVICE_START_TOOL_NAME && looksLikeNamedToolEvent(value)
}

function looksLikeNamedToolEvent(value: object) {
  return (
    hasObjectProperty(value, 'data') ||
    hasObjectProperty(value, 'args') ||
    hasObjectProperty(value, 'tool_call_id') ||
    hasObjectProperty(value, 'toolCall') ||
    readStringProperty(value, 'type') === 'tool_call'
  )
}

function readStringProperty(value: object, key: string) {
  const property = readObjectProperty(value, key)
  return typeof property === 'string' ? property : null
}

function readObjectProperty(value: object, key: string): unknown {
  if (!hasObjectProperty(value, key)) {
    return undefined
  }

  return Reflect.get(value, key)
}

function hasObjectProperty(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
