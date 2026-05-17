import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import type { IKnowledgebase } from './knowledgebase.model'
import type { IKnowledgeDocument } from './knowledge-doc.model'
import type { IKnowledgeDocumentChunk } from './knowledge-doc-chunk.model'

export enum KnowledgeGraphStatus {
  DISABLED = 'disabled',
  INDEXING = 'indexing',
  READY = 'ready',
  FAILED = 'failed',
  REBUILD_REQUIRED = 'rebuild_required'
}

export enum KnowledgeGraphIndexJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export type KnowledgeGraphIndexJobType = 'document' | 'rebuild'

export type GraphRagRetrievalMode = 'vector' | 'graph' | 'hybrid'

export type KnowledgeGraphItemOrigin = 'extracted' | 'manual' | 'curated'

export type KnowledgeGraphVisibility = 'active' | 'hidden'

export type GraphRagConfig = {
  enabled?: boolean
  entityTopK?: number
  neighborHops?: number
  communityTopK?: number
  graphWeight?: number
  extractionBatchSize?: number
  extractionMaxCharacters?: number
}

export type KnowledgeGraphEvidence = {
  chunkId: string
  quote?: string | null
  confidence?: number | null
}

export interface IKnowledgeGraphEntity extends IBasePerTenantAndOrganizationEntityModel {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  type: string
  name: string
  normalizedName: string
  origin?: KnowledgeGraphItemOrigin
  visibility?: KnowledgeGraphVisibility
  aliases?: string[] | null
  description?: string | null
  summary?: string | null
  confidence?: number | null
  mentionCount?: number | null
  revision?: number | null
  metadata?: {
    [key: string]: unknown
  } | null
}

export interface IKnowledgeGraphRelation extends IBasePerTenantAndOrganizationEntityModel {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  sourceEntityId?: string
  sourceEntity?: IKnowledgeGraphEntity
  targetEntityId?: string
  targetEntity?: IKnowledgeGraphEntity
  type: string
  normalizedType?: string | null
  origin?: KnowledgeGraphItemOrigin
  visibility?: KnowledgeGraphVisibility
  description?: string | null
  confidence?: number | null
  weight?: number | null
  evidenceCount?: number | null
  revision?: number | null
  metadata?: {
    [key: string]: unknown
  } | null
}

export interface IKnowledgeGraphMention extends IBasePerTenantAndOrganizationEntityModel {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  entityId?: string
  entity?: IKnowledgeGraphEntity
  relationId?: string | null
  relation?: IKnowledgeGraphRelation | null
  documentId?: string
  document?: IKnowledgeDocument
  chunkId?: string
  chunk?: IKnowledgeDocumentChunk
  quote?: string | null
  confidence?: number | null
  startOffset?: number | null
  endOffset?: number | null
  revision?: number | null
  metadata?: {
    [key: string]: unknown
  } | null
}

export interface IKnowledgeGraphCommunity extends IBasePerTenantAndOrganizationEntityModel {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  key: string
  title?: string | null
  summary?: string | null
  entityIds?: string[] | null
  revision?: number | null
  metadata?: {
    [key: string]: unknown
  } | null
}

export interface IKnowledgeGraphIndexJob extends IBasePerTenantAndOrganizationEntityModel {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase
  documentId?: string | null
  document?: IKnowledgeDocument | null
  type: KnowledgeGraphIndexJobType
  status: KnowledgeGraphIndexJobStatus
  revision?: number | null
  totalChunks?: number | null
  processedChunks?: number | null
  error?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
}

export type KnowledgeGraphStatusResponse = {
  status: KnowledgeGraphStatus
  enabled: boolean
  revision?: number | null
  error?: string | null
  entityCount: number
  relationCount: number
  mentionCount: number
  queuedJobCount: number
  runningJobCount: number
  failedJobCount: number
  jobs?: IKnowledgeGraphIndexJob[]
}

export type KnowledgeGraphViewNode = {
  id: string
  name: string
  type: string
  origin: KnowledgeGraphItemOrigin
  visibility: KnowledgeGraphVisibility
  mentionCount?: number | null
  confidence?: number | null
  symbolSize?: number
  value?: number
}

export type KnowledgeGraphViewEdge = {
  id: string
  source: string
  target: string
  type: string
  origin: KnowledgeGraphItemOrigin
  visibility: KnowledgeGraphVisibility
  weight?: number | null
  evidenceCount?: number | null
}

export type KnowledgeGraphViewResponse = {
  nodes: KnowledgeGraphViewNode[]
  edges: KnowledgeGraphViewEdge[]
  entityTypes: string[]
  relationTypes: string[]
  totalNodes: number
  totalEdges: number
}

export type KnowledgeGraphVisualizationQuery = {
  search?: string | null
  entityType?: string | null
  relationType?: string | null
  origin?: KnowledgeGraphItemOrigin | null
  visibility?: KnowledgeGraphVisibility | null
  focusEntityId?: string | null
  depth?: number | null
  take?: number | null
}

export type KnowledgeGraphMentionListQuery = {
  entityId?: string | null
  relationId?: string | null
  documentId?: string | null
  chunkId?: string | null
  take?: number | null
}

export type KnowledgeGraphEntityChunksQuery = {
  neighborHops?: number | null
  take?: number | null
  includeMentions?: boolean | null
  mentionTake?: number | null
  documentId?: string | null
}

export type KnowledgeGraphEntityChunksResponse = {
  entity: IKnowledgeGraphEntity
  chunks: IKnowledgeDocumentChunk[]
  evidenceByChunkId: Record<string, IKnowledgeGraphMention[]>
  totals: {
    chunks: number
    mentions: number
    entityIds: number
    relations: number
  }
  limits: {
    take: number
    neighborHops: number
    mentionTake: number
    includeMentions: boolean
  }
  truncated?: {
    chunks?: boolean
    mentions?: boolean
  }
}

export type KnowledgeGraphEntityCreateInput = {
  name: string
  type: string
  aliases?: string[] | null
  description?: string | null
  visibility?: KnowledgeGraphVisibility
}

export type KnowledgeGraphEntityUpdateInput = Partial<KnowledgeGraphEntityCreateInput>

export type KnowledgeGraphRelationCreateInput = {
  sourceEntityId: string
  targetEntityId: string
  type: string
  description?: string | null
  weight?: number | null
  visibility?: KnowledgeGraphVisibility
}

export type KnowledgeGraphRelationUpdateInput = Partial<KnowledgeGraphRelationCreateInput>
