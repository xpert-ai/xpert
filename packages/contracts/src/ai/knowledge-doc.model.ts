import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IIntegration } from '../integration.model'
import { IStorageFile } from '../storage-file.model'
import { IKnowledgeDocumentPage } from './knowledge-doc-page.model'
import { IKnowledgebaseTask } from './knowledgebase-task.model'
import { IKnowledgebase } from './knowledgebase.model'
import { TRagWebOptions } from './rag-web'
import { IKnowledgeDocumentChunk } from './knowledge-doc-chunk.model'
import { DocumentSourceProviderCategoryEnum } from './knowledge-pipeline'


export type DocumentParserConfig = {
  pages?: number[][]
  replaceWhitespace?: boolean
  removeSensitive?: boolean
  textSplitterType?: string
  textSplitter?: {
    [key: string]: unknown
  }
  transformerType?: string
  transformerIntegration?: string
  transformer?: {
    [key: string]: unknown
  }
  imageUnderstandingType?: string
  imageUnderstandingIntegration?: string
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
 * ...
 */
export enum DocumentTypeEnum {
  /**
   * Folder, parent of other documents
   */
  FOLDER = 'folder',

  /**
   * Local files
   * @deprecated use DocumentSourceProviderCategoryEnum local file type instead
   */
  FILE = 'file'
}
export const KDocumentSourceType = {
  ...DocumentSourceProviderCategoryEnum,
  ...DocumentTypeEnum
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
  WAITING = 'waiting',
  VALIDATE = 'validate',
  RUNNING = 'running',
  TRANSFORMED = 'transformed',
  SPLITTED = 'splitted',
  UNDERSTOOD = 'understood',
  EMBEDDING = 'embedding',
  CANCEL = 'cancel',
  FINISH = 'finish',
  ERROR = 'error'
}

export type TDocumentWebOptions = TRagWebOptions & {
  //
}

export type TDocSourceConfig = {
  key?: string
}

export type TKnowledgeDocument = {
  disabled?: boolean
  
  knowledgebaseId?: string

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
   * @deprecated unused
   */
  parserId: string
  parserConfig: DocumentTextParserConfig
  /**
   * where dose this document come from
   */
  sourceType?: DocumentSourceProviderCategoryEnum | DocumentTypeEnum
  sourceConfig?: TDocSourceConfig
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
  /**
   * Folder path in server for this document file.
   * Init it in creating document entity.
   */
  folder?: string

  size?: string
  mimeType?: string

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

  /**
	 * @deprecated use chunks instead
	 */
  pages?: IKnowledgeDocumentPage[]

  chunks?: IKnowledgeDocumentChunk[]
  tasks?: IKnowledgebaseTask[]
}

/**
 * Document, include file, web pages, folder, virtual, etc.
 */
export interface IKnowledgeDocument<T = Metadata> extends TKnowledgeDocument, IBasePerTenantAndOrganizationEntityModel {
  parent?: IKnowledgeDocument | null
  children?: IKnowledgeDocument[]
  knowledgebase?: IKnowledgebase

  draft?: TKnowledgeDocument
  
  metadata?: T
}

// export interface IDocumentChunk<Metadata = DocumentMetadata> {
//   id: string
//   pageContent: string
//   metadata: Metadata & {
//     knowledgeId?: string
//   }
//   collection_id: string
// }

export type Metadata = any

export interface IKnowledgeDocumentCreateInput
	extends IKnowledgeDocument, IBasePerTenantAndOrganizationEntityModel {}

export interface IKnowledgeDocumentUpdateInput
	extends Partial<IKnowledgeDocumentCreateInput> {
	id?: string;
}

export interface IKnowledgeDocumentFindInput
	extends IBasePerTenantAndOrganizationEntityModel,
		IKnowledgeDocument {}


export function isDocumentSheet(type: string): boolean {
  return ['csv', 'xls', 'xlsx', 'ods', 'vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(type)
}

export function isImageType(type: string): boolean {
  return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'svg', 'webp'].includes(type)
}

export function isVideoType(type: string): boolean {
  return ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'].includes(type)
}

export function isAudioType(type: string): boolean {
  return ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(type)
}

export function classificateDocumentCategory(entity: Partial<IKnowledgeDocument>): KBDocumentCategoryEnum {
  return isDocumentSheet(entity.type) ? KBDocumentCategoryEnum.Sheet : 
									isImageType(entity.type) ? KBDocumentCategoryEnum.Image : 
									isVideoType(entity.type) ? KBDocumentCategoryEnum.Video :
									isAudioType(entity.type) ? KBDocumentCategoryEnum.Audio :
									KBDocumentCategoryEnum.Text
}