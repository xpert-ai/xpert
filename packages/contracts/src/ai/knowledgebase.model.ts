import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ICopilotModel } from './copilot-model.model'
import { TAvatar } from '../types'

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
}

/**
 * Knowledgebase Entity
 */
export interface IKnowledgebase extends TKnowledgebase, IBasePerTenantAndOrganizationEntityModel {
  //
}

export enum KnowledgebasePermission {
  Private = 'private',
  Organization = 'organization',
  Public = 'public'
}
