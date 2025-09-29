import { DocumentInterface } from '@langchain/core/documents'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IIntegration } from '../integration.model'
import { IStorageFile } from '../storage-file.model'
import { IKnowledgeDocumentPage } from './knowledge-doc-page.model'
import { IKnowledgebaseTask } from './knowledgebase-task.model'
import { DocumentMetadata, IKnowledgebase } from './knowledgebase.model'
import { TRagWebOptions } from './rag-web'


export type DocumentParserConfig = {
  pages?: number[][]
  replaceWhitespace?: boolean
  removeSensitive?: boolean
  textSplitterType?: string
  textSplitter?: {
    [key: string]: unknown
  }
  transformerType?: string
  transformer?: {
    [key: string]: unknown
  }
  imageUnderstandingType?: string
  imageUnderstanding?: {
    [key: string]: unknown
  }
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
   * Remote files (FTP, SFTP, etc.)
   */
  REMOTE_FILE = 'remote-file',
  /**
   * Web documents
   */
  WEB = 'web',
  /**
   * Folder, parent of other documents
   */
  FOLDER = 'folder',
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
  WAITED = 'waited',
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

  /**
   * @deprecated use fileUrl instead
   */
  storageFileId?: string
  /**
   * @deprecated use fileUrl instead
   */
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
  sourceConfig?: any
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
   * where does it store
   */
  filePath: string
  fileUrl?: string

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
  task?: IKnowledgebaseTask
  taskId?: string
}

/**
 * Document, include file, web pages, folder, virtual, etc.
 */
export interface IKnowledgeDocument extends TKnowledgeDocument, IBasePerTenantAndOrganizationEntityModel {
  // parentId?: string | null
  parent?: IKnowledgeDocument | null
  children?: IKnowledgeDocument[]

  // Temp
  chunks?: DocumentInterface[]
  metadata?: Metadata
}

export interface IDocumentChunk<Metadata = DocumentMetadata> {
  id: string
  pageContent: string
  metadata: Metadata & {
    knowledgeId?: string
  }
  collection_id: string
}

export type Metadata = Record<string, any>

export function isDocumentSheet(type: string): boolean {
  return ['csv', 'xls', 'xlsx', 'ods'].includes(type)
}