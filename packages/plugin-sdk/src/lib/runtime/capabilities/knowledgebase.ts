import { JSONValue, KnowledgeFilterDiagnostics, KnowledgeFilterNode } from '@xpert-ai/contracts'
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
  filter?: KnowledgeFilterNode
  retrieval?: KnowledgebaseRetrievalSettings
  source: string
  requestId?: string
}

export type KnowledgebaseDocument = {
  id?: string
  pageContent: string
  metadata?: Record<string, unknown>
}

export type KnowledgebaseSearchResult = {
  documents: KnowledgebaseDocument[]
  diagnostics: KnowledgeFilterDiagnostics[]
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

export type KnowledgebaseProvisioningPermission = 'private' | 'organization' | 'public'

export type KnowledgebaseProvisioningMetadataField = {
  key: string
  label?: {
    en_US?: string
    zh_Hans?: string
  }
  type: 'string' | 'number' | 'boolean' | 'enum' | 'datetime' | 'string[]' | 'number[]' | 'object'
  scope?: 'document' | 'chunk'
  enumValues?: string[]
  description?: string
}

export type KnowledgebaseProvisioningSpec = {
  key: string
  name: string
  description: string
  permission: KnowledgebaseProvisioningPermission
  language?: 'Chinese' | 'English'
  chunkSize?: number
  chunkOverlap?: number
  delimiter?: string
  topK?: number
  score?: number
  metadataSchema?: KnowledgebaseProvisioningMetadataField[]
  incrementalSyncEnabled?: boolean
}

export type KnowledgebaseEnsureInput = {
  workspaceId: string
  namespace: string
  /**
   * Reuse the most recently updated accessible knowledgebase embedding-model configuration when
   * creating a managed set. This keeps one-click provisioning usable without exposing provider
   * credentials to plugins. Provisioning fails explicitly when no configured model is available.
   */
  inheritEmbeddingModel?: boolean
  knowledgebases: KnowledgebaseProvisioningSpec[]
}

export type KnowledgebaseEnsureItem = KnowledgebaseListItem & {
  key: string
  operation: 'created' | 'updated'
}

export type KnowledgebaseEnsureResult = {
  namespace: string
  workspaceId: string
  knowledgebases: KnowledgebaseEnsureItem[]
}

export type KnowledgebaseConnectAgentInput = {
  workspaceId: string
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  /** Optional administrator-owned retrieval policies keyed by knowledgebase id. */
  retrievals?: Record<
    string,
    KnowledgebaseRetrievalSettings & {
      fixedFilter?: KnowledgeFilterNode
      allowAgentFilter?: boolean
    }
  >
}

export type KnowledgebaseConnectAgentResult = {
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  addedKnowledgebaseIds: string[]
}

export interface KnowledgebaseProvisioningApi {
  ensure(input: KnowledgebaseEnsureInput): Promise<KnowledgebaseEnsureResult>

  connectAgent(input: KnowledgebaseConnectAgentInput): Promise<KnowledgebaseConnectAgentResult>
}

export interface KnowledgebaseApi {
  list(input: KnowledgebaseListInput): Promise<KnowledgebaseListItem[]>

  search(input: KnowledgebaseSearchInput): Promise<KnowledgebaseSearchResult>

  writeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult>

  deleteChunks(input: KnowledgebaseDeleteChunksInput): Promise<KnowledgebaseDeleteChunksResult>
}

export const KnowledgebaseRuntimeCapability = createRuntimeCapability<KnowledgebaseApi>('platform.knowledgebase', {
  description: 'List, search, and write chunks in platform knowledgebases.'
})

export const KnowledgebaseProvisioningRuntimeCapability = createRuntimeCapability<KnowledgebaseProvisioningApi>(
  'platform.knowledgebase.provisioning',
  {
    description: 'Idempotently provision managed platform knowledgebases and connect them to an Agent.'
  }
)
