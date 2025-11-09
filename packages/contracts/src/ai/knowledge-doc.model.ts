import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IIntegration } from '../integration.model'
import { IStorageFile } from '../storage-file.model'
import { IKnowledgeDocumentPage } from './knowledge-doc-page.model'
import { IKnowledgebaseTask } from './knowledgebase-task.model'
import { IKnowledgebase, KBMetadataFieldDef } from './knowledgebase.model'
import { TRagWebOptions } from './rag-web'
import { IKnowledgeDocumentChunk } from './knowledge-doc-chunk.model'
import { DocumentSourceProviderCategoryEnum } from './knowledge-pipeline'
import { TCopilotModel } from './copilot-model.model'
import { I18nObject } from '../types'


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
  imageUnderstandingModel?: TCopilotModel
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
export interface IKnowledgeDocument<T extends KnowledgeDocumentMetadata = KnowledgeDocumentMetadata> extends TKnowledgeDocument, IBasePerTenantAndOrganizationEntityModel {
  parent?: IKnowledgeDocument | null
  children?: IKnowledgeDocument[]
  knowledgebase?: IKnowledgebase

  draft?: TKnowledgeDocument
  
  metadata?: T
}

/**
 * System built-in standard document Metadata structure
 */
export interface StandardDocumentMetadata {
  // ---- Document Info ----
  originalFileName?: string;          // Original file name, e.g. "Complex_SQL_QA.markdown"
  originalFileSize?: string | null;   // Original file size (if missing, display as "-")
  uploadTime?: string;                // Upload time in ISO format
  lastUpdatedTime?: string;           // Last updated time
  source?: string;                    // Source, e.g. "Local File" / "Web Import" / "API"
  
  // ---- Technical Parameters ----
  segmentRule?: string;               // Segmentation rule, e.g. "General"
  segmentLength?: number;             // Maximum segment length (token or char)
  averageSegmentLength?: string;      // Average segment length
  segmentCount?: number;              // Number of segments
  recallRate?: string;                // Recall count statistics, e.g. "0.00% (0/11)"
  embedTime?: string;                 // Embedding time, e.g. "1.99 sec"
  embedCost?: string | null;          // Embedding cost (if none, display as "-")
}

export interface KnowledgeDocumentMetadata extends StandardDocumentMetadata {
  [key: string]: any
}


// export type Metadata = any

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

/**
 * System standard Metadata field definition constants
 * It can be used for rendering, validation, sorting, displaying descriptions, etc.
 */
export const STANDARD_METADATA_FIELDS: { group: I18nObject; fields: KBMetadataFieldDef[] }[] = [
  // Document Info
  {
    group: {
      en_US: 'Document Info',
      zh_Hans: '文档信息'
    },
    fields: [
      {
        key: 'title',
        label: { en_US: 'Original File Name', zh_Hans: '原始文件名称' },
        type: 'string'
      },
      // {
      //   key: 'originalFileSize',
      //   label: { en_US: 'Original File Size', zh_Hans: '原始文件大小' },
      //   type: 'string'
      // },
      // {
      //   key: 'uploadTime',
      //   label: { en_US: 'Upload Time', zh_Hans: '上传日期' },
      //   type: 'datetime'
      // },
      // {
      //   key: 'lastUpdatedTime',
      //   label: { en_US: 'Last Updated Time', zh_Hans: '最后更新时间' },
      //   type: 'datetime'
      // },
      // {
      //   key: 'source',
      //   label: { en_US: 'Source', zh_Hans: '来源' },
      //   type: 'string'
      // }
    ]
  },
  // Technical Parameters
  // {
  //   group: {
  //     en_US: 'Technical Parameters',
  //     zh_Hans: '技术参数'
  //   },
  //   fields: [
  //     {
  //       key: 'segmentRule',
  //       label: { en_US: 'Segmentation Rule', zh_Hans: '分段规则' },
  //       type: 'string'
  //     },
  //     {
  //       key: 'segmentLength',
  //       label: { en_US: 'Segment Length', zh_Hans: '段落长度' },
  //       type: 'number'
  //     },
  //     {
  //       key: 'averageSegmentLength',
  //       label: { en_US: 'Average Segment Length', zh_Hans: '平均段落长度' },
  //       type: 'string'
  //     },
  //     {
  //       key: 'segmentCount',
  //       label: { en_US: 'Segment Count', zh_Hans: '段落数量' },
  //       type: 'number'
  //     },
  //     {
  //       key: 'recallRate',
  //       label: { en_US: 'Recall Count', zh_Hans: '召回次数' },
  //       type: 'string'
  //     },
  //     {
  //       key: 'embedTime',
  //       label: { en_US: 'Embedding Time', zh_Hans: '嵌入时间' },
  //       type: 'string'
  //     },
  //     {
  //       key: 'embedCost',
  //       label: { en_US: 'Embedding Cost', zh_Hans: '嵌入花费' },
  //       type: 'string'
  //     }
  //   ]
  // }
] as const;


export type StandardMetadataFieldKey = typeof STANDARD_METADATA_FIELDS[number]['fields'][number]['key'];
