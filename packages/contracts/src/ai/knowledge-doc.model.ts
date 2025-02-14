import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IIntegration } from '../integration.model'
import { IStorageFile } from '../storage-file.model'
import { IKnowledgebase } from './knowledgebase.model'
import { TRagWebOptions } from './rag-web'

export type DocumentParserConfig = {
  pages?: number[][]
  delimiter: string
  chunkSize: number | null
  chunkOverlap: number | null
}

export enum KDocumentSourceType {
  FILE = 'file',
  WEB = 'web'
}

export type TDocumentWebOptions = TRagWebOptions & {
  //
}

export type TKnowledgeDocument = {
  knowledgebaseId?: string
  knowledgebase?: IKnowledgebase

  storageFileId?: string
  storageFile?: IStorageFile

  /**
   * thumbnail base64 string
   */
  thumbnail?: string

  /**
   * default parser ID
   */
  parserId: string
  parserConfig: DocumentParserConfig
  /**
   * where dose this document come from
   */
  sourceType?: KDocumentSourceType | null
  /**
   * Local file extension or Web doc provider
   */
  type: string
  /**
   * file name
   */
  name: string
  /**
   * where dose it store
   */
  location: string

  size: string

  tokenNum?: number | null
  chunkNum?: number | null

  progress?: number | null
  /**
   * process message
   */
  processMsg?: string | null

  processBeginAt?: Date | null

  processDuation?: number | null

  /**
   * is it validate (0: wasted，1: validate)
   */
  status?: 'wasted' | 'validate' | 'running' | 'cancel' | 'finish' | 'error'
  /**
   * The background job id
   */
  jobId?: string

  options?: TDocumentWebOptions

  integrationId?: string
  integration?: IIntegration
}

export interface IKnowledgeDocument extends TKnowledgeDocument, IBasePerTenantAndOrganizationEntityModel {
  //
}

export interface IDocumentChunk {
  id: string
  content: string
  metadata: {
    knowledgeId?: string
    [key: string]: any | null
  }
  collection_id: string
}

export type Metadata = Record<string, any>
