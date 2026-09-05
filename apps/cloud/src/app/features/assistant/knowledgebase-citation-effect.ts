import {
  ASSISTANT_CITATION_OPEN_EVENT,
  KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
  type XpertViewHostEventMessage
} from '@xpert-ai/contracts'

export type KnowledgebaseCitationEffectTarget = {
  knowledgebaseId?: string
  documentId?: string
  faqId?: string
  chunkId?: string
  page?: number
  sourceBlockIds?: string[]
  evidenceText?: string
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
  const citationUrl = readString(data?.['citationUrl'])
  const faqUrlTarget = parseFAQCitationUrl(citationUrl)
  const documentId = readString(data?.['documentId'])
  const knowledgebaseId = readString(data?.['knowledgebaseId']) ?? faqUrlTarget?.knowledgebaseId
  const faqId = readString(data?.['faqId']) ?? faqUrlTarget?.faqId
  const chunkId = readString(data?.['chunkId'])
  const page = readPositiveInteger(data?.['page'])
  const sourceBlockIds = readStringArray(data?.['sourceBlockIds'])
  const evidenceText = readString(data?.['evidenceText'])
  const documentName = readString(data?.['documentName'])
  if (!documentId && !faqId) {
    return null
  }

  return {
    ...(documentId ? { documentId } : {}),
    ...(faqId ? { faqId } : {}),
    ...(knowledgebaseId ? { knowledgebaseId } : {}),
    ...(chunkId ? { chunkId } : {}),
    ...(page ? { page } : {}),
    ...(sourceBlockIds.length ? { sourceBlockIds } : {}),
    ...(evidenceText ? { evidenceText } : {}),
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
      target.faqId,
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

function parseFAQCitationUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'xpert:' || url.hostname !== 'knowledgebase' || url.pathname !== '/faq') return null
    const knowledgebaseId = readString(url.searchParams.get('knowledgebaseId'))
    const faqId = readString(url.searchParams.get('faqId'))
    return knowledgebaseId && faqId ? { knowledgebaseId, faqId } : null
  } catch {
    return null
  }
}

function createEventId(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(':') || `event:${Date.now()}`
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
