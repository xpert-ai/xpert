import {
  IKnowledgeDocument,
  KBDocumentCategoryEnum,
  KDocumentSourceType,
  KnowledgebaseParserConfig,
  TCopilotModel,
  TRagWebOptions
} from '@xpert-ai/contracts'
import { v4 as uuid } from 'uuid'
import { cloneDeep, pick } from 'lodash-es'

export type DocumentImportSource = 'files' | 'folder' | 'url' | 'crawl' | 'remote' | 'online' | 'pipeline'
export type KnowledgePipelineImportResult = { taskId: string }
export type ImportParserConfig = IKnowledgeDocument['parserConfig']
export type ImportSettingsSection = 'parser' | 'chunks' | 'images'

export const DOCUMENT_IMPORT_SOURCES = [
  { id: 'files', key: 'UploadFiles', icon: 'ri-upload-2-line', available: true },
  { id: 'folder', key: 'UploadFolder', icon: 'ri-folder-upload-line', available: false },
  { id: 'url', key: 'ImportUrl', icon: 'ri-link', available: true },
  { id: 'online', key: 'OnlineEdit', icon: 'ri-edit-line', available: false },
  { id: 'pipeline', key: 'Pipeline', icon: 'ri-flow-chart', available: true },
  { id: 'remote', key: 'RemoteFiles', icon: 'ri-cloud-line', available: true },
  { id: 'crawl', key: 'WebCrawl', icon: 'ri-global-line', available: true }
] as const

export function quickWebOptions(url: string): TRagWebOptions {
  return { url: url.trim(), params: { mode: 'scrape' } }
}

/** Shared chunk controls own these fields; spreadsheet conversion and image settings retain their own draft. */
export function mergeSheetProcessingConfig(
  sheetConfig: ImportParserConfig,
  processingConfig: ImportParserConfig
): ImportParserConfig {
  return {
    ...sheetConfig,
    ...pick(processingConfig, [
      'textSplitterType',
      'textSplitter',
      'chunkSize',
      'chunkOverlap',
      'maxChunkTokens',
      'chunkLanguageHint',
      'delimiter',
      'separators',
      'questionGeneration'
    ])
  }
}

export function buildImportDocuments(
  documents: Partial<IKnowledgeDocument>[],
  config: ImportParserConfig,
  knowledgebaseId: string,
  parentId: string | null,
  options?: {
    pdfParser?: KnowledgebaseParserConfig['pdfParser']
    visionModel?: TCopilotModel
    sheetParserConfig?: ImportParserConfig
  }
): Partial<IKnowledgeDocument>[] {
  const onlySheet =
    documents.length > 0 && documents.every((document) => document.category === KBDocumentCategoryEnum.Sheet)
  return documents.map(({ id, ...document }) => ({
    ...document,
    knowledgebaseId,
    parent: parentId ? ({ id: parentId } as IKnowledgeDocument) : null,
    parserConfig: cloneDeep(
      document.category === KBDocumentCategoryEnum.Sheet
        ? mergeSheetProcessingConfig(
            options?.sheetParserConfig ?? (onlySheet ? config : (document.parserConfig ?? {})),
            config
          )
        : {
            ...config,
            ...(document.type?.replace(/^\./, '').toLowerCase() === 'pdf' ? options?.pdfParser : {}),
            ...(options?.visionModel ? { imageUnderstandingModel: options.visionModel } : {})
          }
    )
  }))
}

/** The remote-source test API returns text pages, not KnowledgeFileUploader instances. */
export function remoteSourceDocuments(value: unknown): Partial<IKnowledgeDocument>[] {
  if (!Array.isArray(value)) throw new Error('Invalid remote document response')
  return value.map((item: unknown, index): Partial<IKnowledgeDocument> => {
    if (!item || typeof item !== 'object' || !('pageContent' in item) || typeof item.pageContent !== 'string') {
      throw new Error('Invalid remote document response')
    }
    const metadata = 'metadata' in item && item.metadata && typeof item.metadata === 'object' ? item.metadata : null
    const source = metadata && 'source' in metadata && typeof metadata.source === 'string' ? metadata.source : undefined
    const name =
      metadata && 'name' in metadata && typeof metadata.name === 'string'
        ? metadata.name
        : (source ?? `${index + 1}.txt`)
    return {
      name,
      type: 'txt',
      category: KBDocumentCategoryEnum.Text,
      sourceType: KDocumentSourceType.FileSystem,
      metadata: { source },
      pages: [{ id: uuid(), pageContent: item.pageContent, metadata: { source, chunkId: uuid() } }]
    }
  })
}
