import { JSONValue, KnowledgeFilterDiagnostics, KnowledgeFilterNode } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type {
  KnowledgebaseQuery,
  KnowledgebasePage,
  KnowledgebaseGetInput,
  KnowledgebaseDetail,
  KnowledgebaseAccessInput,
  KnowledgebaseAccessResult
} from './knowledgebase-catalog'

export type KnowledgebaseRetrievalMode = 'vector' | 'keyword' | 'graph' | 'hybrid'

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
  rerankThreshold?: number
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
  /** Tenant-owned public libraries, readable by tenant members. */
  scope?: 'workspace' | 'tenant'
  workspaceId?: string | null
  published?: boolean
  limit?: number
}

export type KnowledgebaseListItem = {
  id: string
  name?: string
  description?: string | null
  applicationTags?: string[]
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
  /**
   * Optional system-managed document target. When omitted, the chunk is written to the
   * Agent's shared writer document for backwards compatibility. A stable key creates an
   * independently managed document that can be placed in a knowledgebase folder.
   */
  document?: {
    key: string
    name: string
    parentId?: string | null
    metadata?: KnowledgebaseMetadata
  }
  executionId?: string
  threadId?: string
}

export type KnowledgebaseWriteChunkResult = {
  status?: 'created' | 'skipped'
  chunkId?: string
  knowledgebaseId?: string
  knowledgebaseName?: string
  documentId?: string
  writeKey?: string
  message?: string
}

export type KnowledgebaseDeleteChunksInput = {
  xpertId: string
  agentKey: string
  knowledgebaseIds: string[]
  knowledgebaseId: string
  writeKeys?: string[]
  writeKeyPrefix?: string
  /** Restrict deletion to a dedicated system-managed document created by writeChunk. */
  documentKey?: string
  /** Remove the managed document after deletion when it has no chunks left. */
  deleteDocumentIfEmpty?: boolean
}

export type KnowledgebaseDeleteChunksResult = {
  deletedCount: number
  knowledgebaseId: string
  documentId?: string
  writeKeys?: string[]
  writeKeyPrefix?: string
  documentDeleted?: boolean
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
  /** Set the graph switch without replacing existing graph retrieval or extraction settings. */
  graphRag?: { enabled: boolean }
}

export type KnowledgebaseEnsureInput = {
  /** Tenant provisioning requires SUPER_ADMIN already in tenant request scope; workspaceId supplies model discovery only. */
  scope?: 'workspace' | 'tenant'
  workspaceId: string
  namespace: string
  /**
   * Fill missing embedding bindings from the current user's available Copilot provider catalog,
   * falling back to the most recently updated ordinary knowledgebase in this workspace.
   * Existing bindings are preserved. No provider credentials are exposed to plugins.
   * Provisioning fails explicitly when a missing binding cannot be resolved.
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

/**
 * Set up application-managed libraries and Agent connections using trusted configuration.
 * Use during installation/configuration; use KnowledgebaseApi for runtime discovery and
 * retrieval, and the document capability for ingestion. Provisioning retains host access checks.
 */
export interface KnowledgebaseProvisioningApi {
  /**
   * Reconcile declared libraries by stable namespace/key, creating missing resources
   * and updating managed settings. Preserve keys across retries to avoid duplicate libraries.
   * Tenant provisioning requires an administrator already in tenant scope.
   */
  ensure(input: KnowledgebaseEnsureInput): Promise<KnowledgebaseEnsureResult>

  /**
   * Connect selected libraries and optional retrieval policies to an existing Agent.
   * Existing connections are retained; repeated connections are not duplicated.
   * Supply Agent/workspace identity from trusted configuration; binding does not grant access.
   */
  connectAgent(input: KnowledgebaseConnectAgentInput): Promise<KnowledgebaseConnectAgentResult>
}

/**
 * Discover knowledgebase resources and consume indexed knowledge through the host runtime.
 * Keep resource discovery (query), readiness (get), permissions (getAccess) and content
 * retrieval (search) separate. Use the document capability for ingestion/lifecycle,
 * and the provisioning capability for managed setup and Agent connections.
 * Catalog methods use trusted request context; permission checks never authorize later
 * writes. Feature-detect optional methods on older hosts and require an upgrade if needed.
 */
export interface KnowledgebaseApi {
  /**
   * Legacy discovery; preserves existing scope, shared-library semantics and array results.
   * @deprecated Use query for new integrations. Migrate scope and pagination explicitly;
   * a readable result does not establish write permission.
   */
  list(input: KnowledgebaseListInput): Promise<KnowledgebaseListItem[]>

  /**
   * Discover resources by scope, metadata and required actions. Use workspace/owned
   * for destinations belonging to that workspace; use search for indexed content.
   * Follow nextCursor until null, even after empty pages. Cursors bind query/context,
   * not a snapshot or permission grant; every page rechecks access.
   */
  query?(input: KnowledgebaseQuery): Promise<KnowledgebasePage>

  /**
   * Read safe resource metadata, ingestion capability and processing readiness.
   * Combine with getAccess before costly work: readiness and permission are independent,
   * and a configured model binding does not guarantee provider health.
   * Missing and unreadable resources produce the same unavailable error.
   */
  get?(input: KnowledgebaseGetInput): Promise<KnowledgebaseDetail>

  /**
   * Inspect current action permissions for known IDs; use query to discover candidates.
   * Missing and inaccessible IDs both return unavailable with denied actions.
   * Recheck after long-running work and retain authorization on actual mutations.
   */
  getAccess?(input: KnowledgebaseAccessInput): Promise<KnowledgebaseAccessResult>

  /**
   * Retrieve indexed content from selected libraries using retrieval modes and filters.
   * Preserve metadata for citations/provenance and use diagnostics to explain filtering.
   * Derive legacy identity overrides from trusted context, never model-authored input.
   */
  search(input: KnowledgebaseSearchInput): Promise<KnowledgebaseSearchResult>

  /**
   * Write a small Agent-managed knowledge item into a connected library. Stable writeKey
   * values allow replay detection; existing writes are skipped, not replaced. Use a stable
   * document key for an independent projection. Use the document capability for file
   * ingestion and durable processing, and trusted configuration for Agent bindings.
   */
  writeChunk(input: KnowledgebaseWriteChunkInput): Promise<KnowledgebaseWriteChunkResult>

  /**
   * Remove Agent-managed writes by exact keys or a narrow application prefix.
   * Match documentKey to the write target; optionally remove its empty managed document.
   * A missing target is a no-op. Use the document capability for ordinary document deletion.
   */
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
