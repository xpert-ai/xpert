import { ICopilotModel } from './copilot-model.model'
import { TAvatar } from '../types'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { IKnowledgeDocument } from './knowledge-doc.model'
import { IXpert } from './xpert.model'
import { IIntegration } from '../integration.model'

/**
 * Non-internal types should remain the same as IntegrationEnum.
 */
export enum KnowledgeProviderEnum {
  Internal = 'internal',
}

export enum KnowledgebaseTypeEnum {
  Standard = 'standard',
  External = 'external'
}

export enum KnowledgeChunkStructureEnum {
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
   * Public in tenant or in organization or private
   * @default private
   */
  permission?: KnowledgebasePermission

  /**
   * Copilot model for knowledgebase
   */
  copilotModel?: ICopilotModel
  copilotModelId?: string

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
   * default parser ID
   */
  parserId?: string

  parserConfig?: KnowledgebaseParserConfig

  /**
   * Chunk structure determines how the knowledge base organizes and indexes your document content.
   */
  chunkStructure?: KnowledgeChunkStructureEnum

  /**
   * Recall params for kb chunks
   */
  recall?: TKBRecallParams

  status?: string

  documents?: IKnowledgeDocument[]

  integrationId?: string
  extKnowledgebaseId?: string
}

/**
 * Knowledgebase Entity
 */
export interface IKnowledgebase extends TKnowledgebase, IBasePerWorkspaceEntityModel {
  xperts?: IXpert[]
  integration?: IIntegration
}

export enum KnowledgebasePermission {
  Private = 'private',
  Organization = 'organization',
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
}

export type DocumentMetadata = {
    score?: number; 
    relevanceScore?: number
} & Record<string, any>;