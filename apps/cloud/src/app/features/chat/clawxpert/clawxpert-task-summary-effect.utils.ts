import type { ChatTaskSummaryResourceReference } from '@xpert-ai/chatkit-types'
import { CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT } from '@xpert-ai/chatkit-types'
import type { ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'

export type ClawXpertTaskSummaryEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0]

export type ClawXpertTaskSummaryResourceTarget =
  | (Extract<ChatTaskSummaryResourceReference, { type: 'file_change' | 'file_change_set' }> & {
      conversationId?: string
      title?: string
    })
  | {
      type: 'workspace_file'
      conversationId?: string
      workspacePath: string
      fileAssetId?: string
      storageFileId?: string
      title?: string
    }
  | {
      type: 'artifact'
      conversationId?: string
      artifactId: string
      artifactVersionId?: string
      title?: string
    }
  | {
      type: 'browser'
      conversationId?: string
      serviceId?: string
      url?: string
      title?: string
    }
  | {
      type: 'url'
      conversationId?: string
      url: string
      title?: string
    }

type EffectDataCandidate = {
  conversationId?: unknown
  title?: unknown
  resource?: unknown
}

type ResourceCandidate = {
  type?: unknown
  workspacePath?: unknown
  fileAssetId?: unknown
  storageFileId?: unknown
  artifactId?: unknown
  artifactVersionId?: unknown
  first?: { artifactId?: string; artifactVersionId?: string }
  last?: { artifactId?: string; artifactVersionId?: string }
  serviceId?: unknown
  url?: unknown
  messageId?: unknown
  changes?: unknown
}

export function getTaskSummaryResourceTarget(
  event: ClawXpertTaskSummaryEffectEvent
): ClawXpertTaskSummaryResourceTarget | null {
  if (event.name !== CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT || !isObject(event.data)) {
    return null
  }
  const data = event.data as EffectDataCandidate
  if (!isObject(data.resource)) {
    return null
  }
  const resource = data.resource as ResourceCandidate
  const conversationId = readString(data.conversationId)
  const title = readString(data.title)
  if (resource.type === 'workspace_file') {
    const workspacePath = readString(resource.workspacePath)
    return workspacePath
      ? {
          type: 'workspace_file',
          workspacePath,
          conversationId,
          fileAssetId: readString(resource.fileAssetId),
          storageFileId: readString(resource.storageFileId),
          title
        }
      : null
  }
  if (resource.type === 'file_change_set') {
    const messageId = readString(resource.messageId)
    if (!messageId || !Array.isArray(resource.changes) || !resource.changes.length || resource.changes.length > 1024)
      return null
    const changes: Extract<ChatTaskSummaryResourceReference, { type: 'file_change_set' }>['changes'] = []
    for (const item of resource.changes) {
      if (!isObject(item) || !('workspacePath' in item)) return null
      const workspacePath = readString(item.workspacePath)
      if (!workspacePath) return null
      const ref = 'resource' in item ? parseFileChangeResource(item.resource) : undefined
      if ('resource' in item && item.resource != null && !ref) return null
      changes.push({ workspacePath, resource: ref })
    }
    return { type: 'file_change_set', messageId, changes, conversationId, title }
  }
  if (resource.type === 'file_change') {
    const firstId = readString(resource.first?.artifactId),
      firstVersion = readString(resource.first?.artifactVersionId)
    const lastId = readString(resource.last?.artifactId),
      lastVersion = readString(resource.last?.artifactVersionId)
    return firstId && firstVersion && lastId && lastVersion
      ? {
          type: 'file_change',
          first: { artifactId: firstId, artifactVersionId: firstVersion },
          last: { artifactId: lastId, artifactVersionId: lastVersion },
          conversationId,
          title
        }
      : null
  }
  if (resource.type === 'artifact') {
    const artifactId = readString(resource.artifactId)
    return artifactId
      ? {
          type: 'artifact',
          artifactId,
          artifactVersionId: readString(resource.artifactVersionId),
          conversationId,
          title
        }
      : null
  }
  if (resource.type === 'browser') {
    const serviceId = readString(resource.serviceId)
    const url = readHttpUrl(resource.url)
    return serviceId || url ? { type: 'browser', serviceId, url, conversationId, title } : null
  }
  if (resource.type === 'url') {
    const url = readHttpUrl(resource.url)
    return url ? { type: 'url', url, conversationId, title } : null
  }
  return null
}

function isObject(value: unknown): value is object {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readHttpUrl(value: unknown) {
  const text = readString(value)
  if (!text) {
    return undefined
  }
  try {
    const url = new URL(text)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function parseFileChangeResource(
  value: unknown
): Extract<ChatTaskSummaryResourceReference, { type: 'file_change' }> | undefined {
  if (
    !isObject(value) ||
    !('type' in value) ||
    value.type !== 'file_change' ||
    !('first' in value) ||
    !('last' in value)
  )
    return undefined
  const refs = [value.first, value.last].map((ref) => {
    if (!isObject(ref) || !('artifactId' in ref) || !('artifactVersionId' in ref)) return undefined
    const artifactId = readString(ref.artifactId),
      artifactVersionId = readString(ref.artifactVersionId)
    return artifactId && artifactVersionId ? { artifactId, artifactVersionId } : undefined
  })
  return refs[0] && refs[1] ? { type: 'file_change', first: refs[0], last: refs[1] } : undefined
}
