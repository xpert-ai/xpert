import { CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT } from '@xpert-ai/chatkit-types'
import type { ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'

export type ClawXpertTaskSummaryEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0]

export type ClawXpertTaskSummaryResourceTarget =
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
  serviceId?: unknown
  url?: unknown
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
  if (resource.type === 'artifact') {
    const artifactId = readString(resource.artifactId)
    return artifactId ? { type: 'artifact', artifactId, conversationId, title } : null
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
