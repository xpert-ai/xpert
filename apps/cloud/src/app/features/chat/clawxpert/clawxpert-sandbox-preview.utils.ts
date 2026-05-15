import { type ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'

export type ClawXpertSandboxPreviewLogEvent = Parameters<NonNullable<ChatKitEventHandlers['onLog']>>[0]
export type ClawXpertSandboxPreviewEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0]
export type ClawXpertSandboxPreviewTarget = {
  displayUrl?: string | null
  serviceId?: string | null
  url?: string | null
}

const SANDBOX_SERVICE_START_TOOL_NAME = 'sandbox_service_start'
const TOOL_EVENT_NESTED_KEYS = [
  'data',
  'item',
  'payload',
  'content',
  'detail',
  'message',
  'observation',
  'output',
  'toolCall',
  'toolCalls',
  'tool_calls',
  'call',
  'result',
  'response',
  'toolResult',
  'args',
  'arguments'
] as const

export function shouldOpenSandboxPreviewFromEffectEvent(event: ClawXpertSandboxPreviewEffectEvent) {
  return event.name === SANDBOX_SERVICE_START_TOOL_NAME || hasSandboxServiceStartToolEvent(event)
}

export function shouldOpenSandboxPreviewFromLogEvent(event: ClawXpertSandboxPreviewLogEvent) {
  return event.name === SANDBOX_SERVICE_START_TOOL_NAME || hasSandboxServiceStartToolEvent(event)
}

export function getSandboxPreviewTargetFromEffectEvent(
  event: ClawXpertSandboxPreviewEffectEvent
): ClawXpertSandboxPreviewTarget | null {
  return shouldOpenSandboxPreviewFromEffectEvent(event) ? (findSandboxPreviewTarget(event) ?? {}) : null
}

export function getSandboxPreviewTargetFromLogEvent(
  event: ClawXpertSandboxPreviewLogEvent
): ClawXpertSandboxPreviewTarget | null {
  return shouldOpenSandboxPreviewFromLogEvent(event) ? (findSandboxPreviewTarget(event) ?? {}) : null
}

function hasSandboxServiceStartToolEvent(value: unknown, visited = new Set<object>()): boolean {
  if (!value) {
    return false
  }

  const parsedJson = parseJsonPayload(value)
  if (parsedJson !== null) {
    return hasSandboxServiceStartToolEvent(parsedJson, visited)
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

function findSandboxPreviewTarget(value: unknown, visited = new Set<object>()): ClawXpertSandboxPreviewTarget | null {
  if (!value) {
    return null
  }

  const parsedJson = parseJsonPayload(value)
  if (parsedJson !== null) {
    return findSandboxPreviewTarget(parsedJson, visited)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const target = findSandboxPreviewTarget(item, visited)
      if (target) {
        return target
      }
    }

    return null
  }

  if (!isObjectLike(value)) {
    return null
  }

  if (visited.has(value)) {
    return null
  }
  visited.add(value)

  const target = readSandboxPreviewTarget(value)
  if (target) {
    return target
  }

  for (const key of TOOL_EVENT_NESTED_KEYS) {
    const nestedTarget = findSandboxPreviewTarget(readObjectProperty(value, key), visited)
    if (nestedTarget) {
      return nestedTarget
    }
  }

  return null
}

function readSandboxPreviewTarget(value: object): ClawXpertSandboxPreviewTarget | null {
  const actualPort = readNumberProperty(value, 'actualPort')
  const requestedPort = readNumberProperty(value, 'requestedPort')
  const inputPort = readNumberProperty(value, 'port')
  const port = actualPort ?? requestedPort ?? inputPort
  const previewUrl = readStringProperty(value, 'previewUrl')

  if (typeof port !== 'number' && !previewUrl) {
    return null
  }

  const serviceId = readStringProperty(value, 'serviceId') ?? readStringProperty(value, 'id')
  const displayUrl = typeof port === 'number' ? `localhost:${port}` : previewUrl

  return {
    ...(displayUrl ? { displayUrl, url: displayUrl } : {}),
    ...(serviceId ? { serviceId } : {})
  }
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

function readNumberProperty(value: object, key: string) {
  const property = readObjectProperty(value, key)
  return typeof property === 'number' && Number.isFinite(property) ? property : null
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

function parseJsonPayload(value: unknown): unknown | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}
