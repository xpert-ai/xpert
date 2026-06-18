import { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'

export type KnowledgebaseDocumentFile = {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
}

export type KnowledgebaseDocumentMetadata = Record<string, JSONValue>

export type KnowledgebaseDocumentParserConfig = Record<string, JSONValue>

export type KnowledgebaseDocumentDraft = {
  id?: string
  name?: string
  type?: string
  category?: string
  sourceType?: string
  sourceConfig?: Record<string, JSONValue>
  filePath?: string
  fileUrl?: string
  mimeType?: string
  size?: string | number
  parentId?: string
  parserConfig?: KnowledgebaseDocumentParserConfig
  metadata?: KnowledgebaseDocumentMetadata
}

export type KnowledgebaseDocumentRecord = {
  id: string
  name?: string
  type?: string
  category?: string | null
  sourceType?: string | null
  filePath?: string
  fileUrl?: string
  mimeType?: string
  size?: string | number
  status?: string | null
  progress?: number | null
  processMsg?: string | null
  knowledgebaseId?: string
  metadata?: KnowledgebaseDocumentMetadata
}

export type KnowledgebaseUploadFileInput = {
  knowledgebaseId: string
  file: KnowledgebaseDocumentFile
  path?: string
  parentId?: string
}

export type KnowledgebaseUploadedFile = {
  name: string
  filePath: string
  fileUrl: string
  mimeType?: string
  size?: number
  sourceHash?: string
}

export type KnowledgebaseCreateDocumentsInput = {
  knowledgebaseId: string
  documents: KnowledgebaseDocumentDraft[]
  parserConfig?: KnowledgebaseDocumentParserConfig
  metadata?: KnowledgebaseDocumentMetadata
  process?: boolean
}

export type KnowledgebaseCreateDocumentsResult = {
  documents: KnowledgebaseDocumentRecord[]
  processingStarted?: boolean
}

export type KnowledgebaseImportArchiveInput = {
  knowledgebaseId: string
  file: KnowledgebaseDocumentFile
  path?: string
  parentId?: string
  packageId?: string
  packageCode?: string
  parserConfig?: KnowledgebaseDocumentParserConfig
  metadata?: KnowledgebaseDocumentMetadata
  process?: boolean
  maxEntries?: number
  maxEntrySizeBytes?: number
  maxDepth?: number
  supportedExtensions?: string[]
}

export type KnowledgebaseImportArchiveResult = {
  archive: KnowledgebaseUploadedFile
  documents: KnowledgebaseDocumentRecord[]
  skipped: Array<{
    path: string
    reason: string
  }>
  warnings: string[]
  processingStarted?: boolean
  unsupported?: boolean
}

export type KnowledgebaseStartProcessingInput = {
  knowledgebaseId?: string
  documentIds: string[]
}

export type KnowledgebaseDocumentStatusInput = {
  knowledgebaseId?: string
  documentIds: string[]
}

export type KnowledgebaseDocumentStatusResult = {
  documents: KnowledgebaseDocumentRecord[]
}

export type KnowledgebaseDeleteDocumentsInput = {
  knowledgebaseId?: string
  documentIds: string[]
}

export type KnowledgebaseDeleteDocumentsResult = {
  knowledgebaseId?: string
  documentIds: string[]
  deletedDocumentCount: number
  missingDocumentIds?: string[]
}

export interface KnowledgebaseDocumentsApi {
  uploadFile(input: KnowledgebaseUploadFileInput): Promise<KnowledgebaseUploadedFile>

  importArchive(input: KnowledgebaseImportArchiveInput): Promise<KnowledgebaseImportArchiveResult>

  createDocuments(input: KnowledgebaseCreateDocumentsInput): Promise<KnowledgebaseCreateDocumentsResult>

  startProcessing(input: KnowledgebaseStartProcessingInput): Promise<KnowledgebaseDocumentStatusResult>

  getDocumentStatus(input: KnowledgebaseDocumentStatusInput): Promise<KnowledgebaseDocumentStatusResult>

  deleteDocuments(input: KnowledgebaseDeleteDocumentsInput): Promise<KnowledgebaseDeleteDocumentsResult>
}

export const KnowledgebaseDocumentsRuntimeCapability = createRuntimeCapability<KnowledgebaseDocumentsApi>(
  'platform.knowledgebase.documents',
  {
    description: 'Upload, import, create, process, inspect, and delete persistent knowledgebase documents.'
  }
)
