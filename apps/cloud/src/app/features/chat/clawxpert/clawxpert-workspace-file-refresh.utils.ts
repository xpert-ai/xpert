import { type ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'

export type ClawXpertWorkspaceFileRefreshLogEvent = Parameters<NonNullable<ChatKitEventHandlers['onLog']>>[0]
export type ClawXpertWorkspaceFileRefreshEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0]

const WORKSPACE_FILE_REFRESH_LOG_TOOL_NAMES = new Set([
  'sandbox_shell',
  'sandbox_write_file',
  'sandbox_append_file',
  'sandbox_edit_file',
  'sandbox_multi_edit_file',
  'write_memory'
])
const WORKSPACE_FILE_REFRESH_LEGACY_FILE_TOOL_SUFFIXES = new Set([
  'create_file',
  'str_replace',
  'full_file_rewrite',
  'delete_file'
])
const WORKSPACE_FILE_REFRESH_EFFECT_NAMES = new Set<string>()
const WORKSPACE_FILE_REFRESH_NESTED_KEYS = ['data', 'item', 'payload', 'content', 'detail', 'message'] as const

export function shouldRefreshWorkspaceFilesFromEffectEvent(event: ClawXpertWorkspaceFileRefreshEffectEvent) {
  return WORKSPACE_FILE_REFRESH_EFFECT_NAMES.has(event.name)
}

export function shouldRefreshWorkspaceFilesFromLogEvent(event: ClawXpertWorkspaceFileRefreshLogEvent) {
  return findWorkspaceFileRefreshTrigger(event, new Set())
}

function findWorkspaceFileRefreshTrigger(value: unknown, visited: Set<object>): boolean {
  if (!value) {
    return false
  }

  if (Array.isArray(value)) {
    const tuplePayload =
      value.length >= 2 && value[0] === 'log' ? findWorkspaceFileRefreshTrigger(value[1], visited) : false
    if (tuplePayload) {
      return true
    }

    for (const item of value) {
      if (findWorkspaceFileRefreshTrigger(item, visited)) {
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

  if (isWorkspaceFileRefreshToolPayload(value)) {
    return true
  }

  for (const key of WORKSPACE_FILE_REFRESH_NESTED_KEYS) {
    if (findWorkspaceFileRefreshTrigger(readObjectProperty(value, key), visited)) {
      return true
    }
  }

  return false
}

function isWorkspaceFileRefreshToolPayload(value: object) {
  const tool = readStringProperty(value, 'tool')
  if (tool && WORKSPACE_FILE_REFRESH_LOG_TOOL_NAMES.has(tool)) {
    return true
  }

  const toolset = readStringProperty(value, 'toolset')
  if (toolset === 'Bash' && tool === 'execute') {
    return true
  }

  return !!tool && matchesLegacyWorkspaceFileTool(tool)
}

function matchesLegacyWorkspaceFileTool(tool: string) {
  for (const suffix of WORKSPACE_FILE_REFRESH_LEGACY_FILE_TOOL_SUFFIXES) {
    if (tool === suffix || tool.endsWith(`__${suffix}`)) {
      return true
    }
  }

  return false
}

function readStringProperty(value: object, key: string) {
  const property = readObjectProperty(value, key)
  return typeof property === 'string' ? property : null
}

function readObjectProperty(value: object, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(value, key)) {
    return undefined
  }

  return Reflect.get(value, key)
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}
