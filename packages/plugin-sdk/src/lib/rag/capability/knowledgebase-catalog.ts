/** Knowledgebase discovery is scoped to the authenticated runtime, never caller-supplied identities. */
export const knowledgebaseActions = [
  'knowledgebase.read',
  'knowledgebase.manage',
  'content.search',
  'documents.read',
  'documents.create',
  'documents.update',
  'documents.delete',
  'documents.process',
  'chunks.write',
  'chunks.delete'
] as const
export type KnowledgebaseAction = (typeof knowledgebaseActions)[number]

export type KnowledgebaseQuery = {
  scope:
    | { kind: 'workspace'; workspaceId: string; relation: 'owned' | 'available' }
    | { kind: 'organization' }
    | { kind: 'tenant' }
  filter?: {
    /** Literal name/description substring, not content retrieval. */
    text?: string
    visibility?: 'private' | 'organization' | 'public'
    applicationTags?: { allOf: string[] }
    publication?: 'published' | 'unpublished'
  }
  access?: { requireAll: KnowledgebaseAction[] }
  page?: { limit?: number; cursor?: string }
}

export type KnowledgebaseSummary = {
  id: string
  name: string
  description: string | null
  workspaceId: string | null
  visibility: 'private' | 'organization' | 'public'
  applicationTags: string[]
  type: string | null
  status: string | null
  published: boolean
  documentNum: number
  chunkNum: number
}

export type KnowledgebasePage = {
  items: KnowledgebaseSummary[]
  /** Follow even when items is empty; authorization is re-evaluated on every page. */
  nextCursor: string | null
}

export type KnowledgebaseDetail = KnowledgebaseSummary & {
  capabilities: { documentIngestion: boolean }
  configuration: { embeddingConfigured: boolean }
  processing: { blocked: boolean; reason: 'rebuilding' | 'embedding_not_configured' | 'unsupported_type' | null }
}

export type KnowledgebaseGetInput = { knowledgebaseId: string }
export type KnowledgebaseAccessInput = { knowledgebaseIds: string[]; actions: KnowledgebaseAction[] }
export type KnowledgebaseAccessResult = {
  items: Array<{
    knowledgebaseId: string
    /** Missing and inaccessible resources have the same unavailable result. */
    status: 'available' | 'unavailable'
    actions: Array<{ action: KnowledgebaseAction; allowed: boolean }>
  }>
}
