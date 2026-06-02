import { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../runtime-capability'

export type AgentMiddlewareKnowledgebaseRetrievalMode = 'vector' | 'graph' | 'hybrid'

export type AgentMiddlewareKnowledgebaseMetadata = Record<string, JSONValue>

export type AgentMiddlewareKnowledgebaseRetrievalSettings = {
  mode?: AgentMiddlewareKnowledgebaseRetrievalMode
  neighborHops?: number
  entityTopK?: number
  communityTopK?: number
  graphWeight?: number
}

export type AgentMiddlewareKnowledgebaseSearchInput = {
  tenantId?: string
  organizationId?: string
  knowledgebaseIds: string[]
  query: string
  k?: number
  score?: number
  filter?: AgentMiddlewareKnowledgebaseMetadata
  retrieval?: AgentMiddlewareKnowledgebaseRetrievalSettings
  source: string
  requestId?: string
}

export type AgentMiddlewareKnowledgebaseDocument = {
  pageContent: string
  metadata?: Record<string, unknown>
}

export type AgentMiddlewareKnowledgebaseListInput = {
  workspaceId?: string | null
  published?: boolean
  limit?: number
}

export type AgentMiddlewareKnowledgebaseListItem = {
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

export type AgentMiddlewareKnowledgebaseWriteChunkInput = {
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  knowledgebaseId: string
  text: string
  title?: string
  metadata?: AgentMiddlewareKnowledgebaseMetadata
  writeKey: string
  executionId?: string
  threadId?: string
}

export type AgentMiddlewareKnowledgebaseWriteChunkResult = {
  status?: 'created' | 'skipped'
  chunkId?: string
  message?: string
}

export type AgentMiddlewareKnowledgebaseDeleteChunksInput = {
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  knowledgebaseId: string
  writeKeys?: string[]
  writeKeyPrefix?: string
}

export type AgentMiddlewareKnowledgebaseDeleteChunksResult = {
  deletedCount: number
  knowledgebaseId: string
  documentId?: string
  writeKeys?: string[]
  writeKeyPrefix?: string
}

export interface AgentMiddlewareKnowledgebaseApi {
  list(input: AgentMiddlewareKnowledgebaseListInput): Promise<AgentMiddlewareKnowledgebaseListItem[]>

  search(input: AgentMiddlewareKnowledgebaseSearchInput): Promise<AgentMiddlewareKnowledgebaseDocument[]>

  writeChunk(input: AgentMiddlewareKnowledgebaseWriteChunkInput): Promise<AgentMiddlewareKnowledgebaseWriteChunkResult>

  deleteChunks(
    input: AgentMiddlewareKnowledgebaseDeleteChunksInput
  ): Promise<AgentMiddlewareKnowledgebaseDeleteChunksResult>
}

export const KnowledgebaseRuntimeCapability = createRuntimeCapability<AgentMiddlewareKnowledgebaseApi>(
  'platform.knowledgebase',
  {
    description: 'List, search, and write chunks in platform knowledgebases.'
  }
)
