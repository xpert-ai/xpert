import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IIntegration } from '../integration.model'
import { IStorageFile } from '../storage-file.model'
import { IKnowledgeDocumentPage } from './knowledge-doc-page.model'
import { IKnowledgebase } from './knowledgebase.model'
import { TRagWebOptions } from './rag-web'


export type DocumentParserConfig = {
  pages?: number[][]
  replaceWhitespace?: boolean
  removeSensitive?: boolean
}

export type DocumentTextParserConfig = DocumentParserConfig & {
  delimiter?: string
  chunkSize?: number | null
  chunkOverlap?: number | null
}

export type DocumentSheetParserConfig = DocumentParserConfig & {
  fields?: string[]
  indexedFields?: string[]
}

/**
 * Import Type:
 * - file: local file
 * - web: web document
 * - feishu
 * - wechat
 * - notion
 * ...
 */
export enum KDocumentSourceType {
  /**
   * Local files
   */
  FILE = 'file',
  /**
   * Web documents
   */
  WEB = 'web'
}

/**
 * Document type category, determine how to process the document.
 */
export enum KBDocumentCategoryEnum {
  Text = 'text',
  Image = 'image',
  Audio = 'audio',
  Video = 'video',
  Sheet = 'sheet',
  Other = 'other'
}

export enum KBDocumentStatusEnum {
  WASTED = 'wasted',
  VALIDATE = 'validate',
  RUNNING = 'running',
  CANCEL = 'cancel',
  FINISH = 'finish',
  ERROR = 'error'
}

export type TDocumentWebOptions = TRagWebOptions & {
  //
}

export type TKnowledgeDocument = {
  disabled?: boolean
  
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
  parserConfig: DocumentTextParserConfig
  /**
   * where dose this document come from
   */
  sourceType?: KDocumentSourceType | null
  /**
   * document type category
   */
  category?: KBDocumentCategoryEnum | null
  /**
   * Local file extension or Web doc provider
   */
  type: string
  /**
   * file name or web url
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
  status?: KBDocumentStatusEnum
  /**
   * The background job id
   */
  jobId?: string

  options?: TDocumentWebOptions

  integrationId?: string
  integration?: IIntegration

  pages?: IKnowledgeDocumentPage[]
}

export interface IKnowledgeDocument extends TKnowledgeDocument, IBasePerTenantAndOrganizationEntityModel {
  //
}

export interface IDocumentChunk {
  id: string
  pageContent: string
  metadata: {
    knowledgeId?: string
    [key: string]: any | null
  }
  collection_id: string
}

export type Metadata = Record<string, any>

export function isDocumentSheet(type: string): boolean {
  return ['csv', 'xls', 'xlsx', 'ods'].includes(type)
}