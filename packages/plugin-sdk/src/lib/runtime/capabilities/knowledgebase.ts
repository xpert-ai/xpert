import { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'

export type KnowledgebaseRetrievalMode = 'vector' | 'graph' | 'hybrid'

export type KnowledgebaseMetadata = Record<string, JSONValue>

export type KnowledgebaseRetrievalSettings = {
  mode?: KnowledgebaseRetrievalMode
  neighborHops?: number
  entityTopK?: number
  communityTopK?: number
  graphWeight?: number
}

export type KnowledgebaseSearchInput = {
  tenantId?: string
  organizationId?: string
  knowledgebaseIds: string[]
  query: string
  k?: number
  score?: number
  filter?: KnowledgebaseMetadata
  retrieval?: KnowledgebaseRetrievalSettings
  source: string
  requestId?: string
}

export type KnowledgebaseDocument = {
  id?: string
  pageContent: string
  metadata?: Record<string, unknown>
}

export type KnowledgebaseListInput = {
  workspaceId?: string | null
  published?: boolean
  limit?: number
}

export type KnowledgebaseListItem = {
  id: string
  name?: string
  description?: string | null
  type?: string | null
  status?: string | null
  permission?: string | null
  workspaceId?: string | null
  documentNum?: number | null
  chunkNum?: number | null
  graphRag?: {
    enabled?: boolean
    [key: string]: JSONValue | undefined
  } | null
  graphStatus?: string | null
}

export type KnowledgebaseWriteChunkInput = {
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  knowledgebaseId: string
  text: string
  title?: string
  metadata?: KnowledgebaseMetadata
  writeKey: string
  executionId?: string
  threadId?: string
}

export type KnowledgebaseWriteChunkResult = {
  status?: 'created' | 'skipped'
  chunkId?: string
  message?: string
}

export type KnowledgebaseDeleteChunksInput = {
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  knowledgebaseId: string
  writeKeys?: string[]
  writeKeyPrefix?: string
}

export type KnowledgebaseDeleteChunksResult = {
  deletedCount: number
  knowledgebaseId: string
  documentId?: string
  writeKeys?: string[]
  writeKeyPrefix?: string
}

export interface KnowledgebaseApi {
  list(input: KnowledgebaseListInput): Promise<KnowledgebaseListItem[]>

  search(input: KnowledgebaseSearchInput): Promise<KnowledgebaseDocument[]>

  writeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult>

  deleteChunks(input: KnowledgebaseDeleteChunksInput): Promise<KnowledgebaseDeleteChunksResult>
}

export const KnowledgebaseRuntimeCapability = createRuntimeCapability<KnowledgebaseApi>('platform.knowledgebase', {
  description: 'List, search, and write chunks in platform knowledgebases.'
})
