import { ICopilotModel } from './copilot-model.model'
import { I18nObject, TAvatar } from '../types'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { IXpert } from './xpert.model'
import { IIntegration } from '../integration.model'
import { channelName } from '../agent/graph'
import { IDocChunkMetadata } from './knowledge-doc-chunk.model'
import type { GraphRagConfig, KnowledgeGraphStatus } from './knowledge-graph.model'

/**
 * Non-internal types should remain the same as IntegrationEnum.
 */
export enum KnowledgeProviderEnum {
  Internal = 'internal'
}

export enum KnowledgebaseTypeEnum {
  Standard = 'standard',
  FAQ = 'faq',
  External = 'external'
}

export enum KnowledgebaseStatusEnum {
  READY = 'ready',
  REBUILD_REQUIRED = 'rebuild_required',
  REBUILDING = 'rebuilding',
  REBUILD_FAILED = 'rebuild_failed'
}

export enum KnowledgeStructureEnum {
  General = 'general',
  ParentChild = 'parent-child',
  QA = 'qa'
}

export type KnowledgebaseParserConfig = {
  pages?: number[][]
  embeddingBatchSize?: number
  chunkSize: number | null
  chunkOverlap: number | null
  delimiter: string | null
}

/**
 * Type of rag knowledgebase
 */
export type TKnowledgebase = {
  /**
   * KB name
   */
  name: string

  /**
   * Type of KB
   */
  type: KnowledgebaseTypeEnum

  /**
   * English | Chinese
   */
  language?: 'Chinese' | 'English' | null
  /**
   * Avatar object
   */
  avatar?: TAvatar
  /**
   * KB description
   */
  description?: string

  /**
   * Stable application-owned classification labels used for exact discovery.
   * These are machine-readable identifiers, not user-facing search tags.
   */
  applicationTags?: string[]
  /**
   * Public in tenant or in organization or private
   * @default private
   */
  permission?: KnowledgebasePermission

  /**
   * Copilot model for knowledgebase
   */
  copilotModel?: ICopilotModel
  copilotModelId?: string

  /**
   * Chat model for knowledgebase LLM tasks.
   */
  chatModel?: ICopilotModel | null
  chatModelId?: string | null

  embeddingCollectionName?: string | null
  embeddingModelFingerprint?: string | null
  embeddingDimensions?: number | null
  embeddingRevision?: number | null

  pendingCopilotModel?: ICopilotModel | null
  pendingCopilotModelId?: string | null
  pendingEmbeddingCollectionName?: string | null
  pendingEmbeddingModelFingerprint?: string | null
  pendingEmbeddingDimensions?: number | null
  pendingEmbeddingRevision?: number | null

  rebuildTaskId?: string | null
  embeddingRebuildError?: string | null

  graphRag?: GraphRagConfig | null
  graphStatus?: KnowledgeGraphStatus | null
  graphRevision?: number | null
  graphIndexError?: string | null

  // Rerank model for re-ranking retrieved chunks
  rerankModel?: ICopilotModel
  rerankModelId?: string

  // Vision model for image understanding
  visionModel?: ICopilotModel
  visionModelId?: string

  documentNum?: number | null
  tokenNum?: number | null
  chunkNum?: number | null
  /**
   *@deprecated use `recall`
   */
  similarityThreshold?: number
  vectorSimilarityWeight?: number
  /**
   * @deprecated
   * default parser ID
   */
  parserId?: string

  parserConfig?: KnowledgebaseParserConfig

  /**
   * Index structure determines how the knowledge base organizes and indexes your document content.
   * @deprecated
   */
  structure?: KnowledgeStructureEnum

  /**
   * Recall params for kb chunks
   */
  recall?: TKBRecallParams

  status?: KnowledgebaseStatusEnum

  /**
   * Metadata custom field definition array
   */
  metadataSchema?: KBMetadataFieldDef[]

  /**
   * API service enabled
   */
  apiEnabled?: boolean

  /**
   * Enable source matching for newly ingested documents.
   */
  incrementalSyncEnabled?: boolean

  documents?: IKnowledgeDocument[]

  integrationId?: string
  extKnowledgebaseId?: string
  pipelineId?: string
}

/**
 * Knowledgebase Entity
 */
export interface IKnowledgebase extends TKnowledgebase, IBasePerWorkspaceEntityModel {
  xperts?: IXpert[]
  integration?: IIntegration
  pipeline?: IXpert
}

/**
 * Knowledgebase permission levels
 */
export enum KnowledgebasePermission {
  /**
   * Only visible to you
   * @default
   */
  Private = 'private',
  /**
   * Visible to all members in the organization
   */
  Organization = 'organization',
  /**
   * Visible to all members in the tenant
   */
  Public = 'public'
}

/**
 * Recall parameters
 */
export type TKBRecallParams = {
  /**
   * Top K of result chunks
   */
  topK?: number
  /**
   * At least the similarity threshold
   */
  score?: number

  /**
   * Weight in EnsembleRetriever
   */
  weight?: number

  /**
   * Candidate fusion strategy. Missing configuration keeps the legacy behavior.
   */
  fusion?: TKBFusionConfig
}

export type KnowledgeFusionMode = 'legacy' | 'weighted_rrf'

export const DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT = 60
export const DEFAULT_KNOWLEDGE_RRF_WEIGHTS = {
  vector: 0.65,
  graph: 0.35,
  keyword: 0.3
} as const

export type TKBFusionConfig = {
  mode?: KnowledgeFusionMode
  rankConstant?: number
  weights?: {
    vector?: number
    graph?: number
    keyword?: number
  }
}

export type DocumentMetadata = IDocChunkMetadata & {
  score?: number
  relevanceScore?: number
} & Record<string, any>

export type MetadataFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'datetime'
  | 'string[]'
  | 'number[]'
  | 'object'

export type KBMetadataFieldDef = {
  key: string // Unique key, e.g. "department"
  label?: I18nObject // Display label
  type: MetadataFieldType
  /**
   * Storage scope of the metadata value. Existing definitions are migrated to `document`.
   */
  scope?: 'document' | 'chunk'
  enumValues?: string[]
  description?: string
}

/**
 * Channel name for knowledgebase pipeline
 */
export const KnowledgebaseChannel = channelName('knowledgebase')
/**
 * Task ID of a knowledgebase run
 */
export const KnowledgeTask = 'task_id'
/**
 * Specify the data source to run
 */
export const KNOWLEDGE_SOURCES_NAME = 'sources'
/** Workflow-state key carrying the requested document processing resume point. */
export const KNOWLEDGE_PROCESSING_MODE_NAME = 'processing_mode'
export const KNOWLEDGE_DOCUMENTS_NAME = 'documents'
export const KNOWLEDGE_FOLDER_ID_NAME = 'folder_id'
export const KNOWLEDGE_STAGE_NAME = 'stage'
