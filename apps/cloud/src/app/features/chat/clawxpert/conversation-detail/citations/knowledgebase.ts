import { ASSISTANT_CITATION_OPEN_EVENT, type XpertViewHostEventMessage } from '@xpert-ai/contracts'

export const KNOWLEDGEBASE_WORKBENCH_VIEW_KEY = 'knowledgebase_workbench'

export type KnowledgebaseCitationTarget = {
  knowledgebaseId?: string
  documentId?: string
  faqId?: string
  wikiPageId?: string
  section?: string
  chunkId?: string
  page?: number
  sourceBlockIds?: string[]
  evidenceText?: string
}

export function getKnowledgebaseCitationTarget(event: XpertViewHostEventMessage): KnowledgebaseCitationTarget | null {
  if (event.type !== ASSISTANT_CITATION_OPEN_EVENT || !event.data) {
    return null
  }

  const documentId = getString(event.data['documentId'])
  const faqId = getString(event.data['faqId'])
  const wikiPageId = getString(event.data['wikiPageId'])
  if (!documentId && !faqId && !wikiPageId) {
    return null
  }

  const knowledgebaseId = getString(event.data['knowledgebaseId'])
  const chunkId = getString(event.data['chunkId'])
  const evidenceText = getString(event.data['evidenceText'])
  const section = getString(event.data['section'])
  const pageValue = event.data['page']
  const parsedPage = typeof pageValue === 'number' ? pageValue : typeof pageValue === 'string' ? Number(pageValue) : 0
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : undefined
  const sourceBlockIdsValue = event.data['sourceBlockIds']
  const sourceBlockIds = Array.isArray(sourceBlockIdsValue)
    ? sourceBlockIdsValue
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 20)
    : []

  return {
    ...(documentId ? { documentId } : {}),
    ...(faqId ? { faqId } : {}),
    ...(wikiPageId ? { wikiPageId } : {}),
    ...(section ? { section } : {}),
    ...(knowledgebaseId ? { knowledgebaseId } : {}),
    ...(chunkId ? { chunkId } : {}),
    ...(page ? { page } : {}),
    ...(sourceBlockIds.length ? { sourceBlockIds } : {}),
    ...(evidenceText ? { evidenceText } : {})
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
