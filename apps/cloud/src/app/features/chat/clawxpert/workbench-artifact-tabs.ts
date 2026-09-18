import type {
  WorkbenchOpenFile,
  IChatConversation,
  XpertViewHostEventMessage,
  XpertViewRuntimeScopeInput
} from '@xpert-ai/contracts'
import type { ChatTaskSummaryOutput } from '@xpert-ai/chatkit-types'

export function generatedConversationOutputs(conversation: IChatConversation | null): ChatTaskSummaryOutput[] {
  return (conversation?.messages ?? [])
    .flatMap((message) =>
      message.role === 'ai' || message.role === 'assistant' ? (message.taskSummary?.outputs ?? []) : []
    )
    .filter(
      (output) =>
        (!output.status || output.status === 'success') &&
        (output.resource?.type === 'workspace_file' || output.resource?.type === 'artifact')
    )
}

export function generatedOutputKey(output: ChatTaskSummaryOutput) {
  return JSON.stringify([output.id, output.updatedAt ?? '', output.resource])
}

export type WorkbenchWorkspaceFile = {
  path: string
  xpertId: string
  conversationId: string | null
  projectId: string | null
}

export type WorkbenchArtifactTab = {
  id: string
  kind: 'artifact'
  title: string
  revision: number
  fileAliases?: string[]
  resource: {
    type: 'file'
    file: WorkbenchOpenFile
    objectUrl?: string
    path?: string
    workspace?: WorkbenchWorkspaceFile
  }
}

export function fileTabsFromToolEvent(
  event: XpertViewHostEventMessage,
  scope: XpertViewRuntimeScopeInput
): WorkbenchArtifactTab[] {
  if (!event.hostId || !event.threadId || !event.toolName || isFailed(event.data)) return []
  const output = parseOutput(event.data?.['output']) ?? {}
  if (!output || isFailed(output) || isFailed(property(output, 'result')) || isFailed(property(output, 'receipt')))
    return []
  const tabs: WorkbenchArtifactTab[] = []
  const artifact = property(output, 'artifact') ?? event.data?.['artifact']
  const files = property(artifact, 'files') ?? property(output, 'files') ?? event.data?.['files']
  for (const value of Array.isArray(files) ? files : []) {
    const file = parseArtifactFile(value)
    if (!file) continue
    const tab = createFileArtifactTab(
      file,
      event.hostId,
      scope,
      undefined,
      readPathString(value, ['filePath']) ?? undefined
    )
    if (!tabs.some((existing) => sameArtifact(existing, tab))) tabs.push(tab)
  }
  return [...new Map(tabs.map((tab) => [tab.id, tab])).values()]
}

export function createFileArtifactTab(
  file: WorkbenchOpenFile,
  hostId: string,
  scope: XpertViewRuntimeScopeInput,
  objectUrl?: string,
  resourceId?: string
): WorkbenchArtifactTab {
  return {
    id: JSON.stringify([
      'file',
      hostId,
      scope.projectId ?? 'personal',
      file.fileAssetId ?? resourceId ?? file.id ?? file.fileId ?? file.storageFileId ?? file.url
    ]),
    kind: 'artifact',
    title: file.name || 'File',
    revision: 0,
    fileAliases: resourceId ? [fileAlias(hostId, scope, resourceId)] : [],
    resource: { type: 'file', file, ...(objectUrl ? { objectUrl } : {}), ...(resourceId ? { path: resourceId } : {}) }
  }
}

function fileAlias(hostId: string, scope: XpertViewRuntimeScopeInput, path: string) {
  return JSON.stringify([hostId, scope.projectId ?? 'personal', normalizeWorkspaceFilePath(path)])
}

export function normalizeWorkspaceFilePath(path: string) {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/workspace\//, '')
    .replace(/^(?:\.\/|\/)+/, '')
}

export function attachWorkspaceFile(
  tab: WorkbenchArtifactTab,
  xpertId: string | null | undefined,
  conversationId: string | null | undefined,
  projectId: string | null | undefined
): WorkbenchArtifactTab {
  if (tab.resource.workspace || !tab.resource.path || !xpertId || (projectId && !conversationId)) return tab
  return {
    ...tab,
    resource: {
      ...tab.resource,
      workspace: {
        path: normalizeWorkspaceFilePath(tab.resource.path),
        xpertId,
        conversationId: conversationId ?? null,
        projectId: projectId ?? null
      }
    }
  }
}

export function sameArtifact(previous: WorkbenchArtifactTab, next: WorkbenchArtifactTab) {
  return previous.id === next.id || Boolean(previous.fileAliases?.some((alias) => next.fileAliases?.includes(alias)))
}

export function updateArtifactTab(previous: WorkbenchArtifactTab, next: WorkbenchArtifactTab): WorkbenchArtifactTab {
  if (previous.resource.objectUrl && previous.resource.objectUrl !== next.resource.objectUrl) {
    URL.revokeObjectURL(previous.resource.objectUrl)
  }
  return {
    ...next,
    resource: { ...next.resource, workspace: next.resource.workspace ?? previous.resource.workspace },
    id: previous.id,
    fileAliases: [...new Set([...(previous.fileAliases ?? []), ...(next.fileAliases ?? [])])],
    revision: previous.revision + 1
  }
}

export function releaseArtifactTab(tab: WorkbenchArtifactTab) {
  if (tab.resource.objectUrl) URL.revokeObjectURL(tab.resource.objectUrl)
}

function parseOutput(value: unknown): object | null {
  if (typeof value === 'string') {
    try {
      return parseOutput(JSON.parse(value))
    } catch {
      return null
    }
  }
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function property(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)
    ? Reflect.get(value, key)
    : undefined
}

function readPathString(value: unknown, path: string[]): string | null {
  value = readPath(value, path)
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readPath(value: unknown, path: string[]): unknown {
  for (const key of path) value = property(value, key)
  return value
}

function isFailed(value: unknown) {
  return (
    property(value, 'success') === false ||
    ['error', 'failed', 'running', 'pending'].includes(String(property(value, 'status')))
  )
}

function parseArtifactFile(value: unknown): WorkbenchOpenFile | null {
  const url = readPathString(value, ['fileUrl'])
  const name = readPathString(value, ['fileName'])
  if (!url || !name || !/^(https?:|blob:)/.test(url)) return null
  return {
    id: readPathString(value, ['fileAssetId']) ?? readPathString(value, ['filePath']) ?? undefined,
    name: name.split('/').pop() || name,
    url,
    mimeType: readPathString(value, ['mimeType']) ?? undefined
  }
}
