import {
  ASSISTANT_CITATION_OPEN_EVENT,
  KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
  type XpertViewHostEventMessage
} from '@xpert-ai/contracts'

export type KnowledgebaseCitationEffectTarget = {
  knowledgebaseId?: string
  documentId: string
  chunkId?: string
  documentName?: string
  citationUrl?: string
}

type ChatKitEffectLike = {
  name?: string
  data?: unknown
}

type HostEventContext = {
  hostType: string
  hostId?: string | null
  threadId?: string | null
}

export function getKnowledgebaseCitationTargetFromEffectEvent(
  event: ChatKitEffectLike
): KnowledgebaseCitationEffectTarget | null {
  if (event.name !== KNOWLEDGEBASE_OPEN_CITATION_EFFECT) {
    return null
  }

  const data = isRecord(event.data) ? event.data : null
  const documentId = readString(data?.['documentId'])
  const knowledgebaseId = readString(data?.['knowledgebaseId'])
  const chunkId = readString(data?.['chunkId'])
  const documentName = readString(data?.['documentName'])
  const citationUrl = readString(data?.['citationUrl'])
  if (!documentId) {
    return null
  }

  return {
    documentId,
    ...(knowledgebaseId ? { knowledgebaseId } : {}),
    ...(chunkId ? { chunkId } : {}),
    ...(documentName ? { documentName } : {}),
    ...(citationUrl ? { citationUrl } : {})
  }
}

export function createKnowledgebaseCitationOpenHostEvent(
  event: ChatKitEffectLike,
  context: HostEventContext
): XpertViewHostEventMessage | null {
  const target = getKnowledgebaseCitationTargetFromEffectEvent(event)
  if (!target) {
    return null
  }

  const receivedAt = new Date().toISOString()

  return {
    id: createEventId([
      ASSISTANT_CITATION_OPEN_EVENT,
      context.hostId ?? undefined,
      target.knowledgebaseId,
      target.documentId,
      target.chunkId,
      receivedAt
    ]),
    type: ASSISTANT_CITATION_OPEN_EVENT,
    source: 'chatkit',
    receivedAt,
    hostType: context.hostType,
    ...(context.hostId ? { hostId: context.hostId } : {}),
    ...(context.threadId ? { threadId: context.threadId } : {}),
    data: target
  }
}

function createEventId(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(':') || `event:${Date.now()}`
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
