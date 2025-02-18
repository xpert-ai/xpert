import { ICopilotModel } from './copilot-model.model'
import { TAvatar } from '../types'
import { IBasePerWorkspaceEntityModel } from './xpert-workspace.model'
import { IKnowledgeDocument } from './knowledge-doc.model'

export enum KnowledgebaseTypeEnum {
  Standard = 'standard',
  External = 'external'
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

  documentNum?: number | null
  tokenNum?: number | null
  chunkNum?: number | null
  /**
   *
   */
  similarityThreshold?: number
  vectorSimilarityWeight?: number
  /**
   * default parser ID
   */
  parserId?: string

  parserConfig?: KnowledgebaseParserConfig

  status?: string

  documents?: IKnowledgeDocument[]
}

/**
 * Knowledgebase Entity
 */
export interface IKnowledgebase extends TKnowledgebase, IBasePerWorkspaceEntityModel {
  //
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