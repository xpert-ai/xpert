import { JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../runtime-capability'

export type AgentMiddlewareKnowledgebaseDocumentFile = {
  buffer: Buffer
  originalname?: string
  mimetype?: string
  size?: number
}

export type AgentMiddlewareKnowledgebaseDocumentMetadata = Record<string, JSONValue>

export type AgentMiddlewareKnowledgebaseDocumentParserConfig = Record<string, JSONValue>

export type AgentMiddlewareKnowledgebaseDocumentDraft = {
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
  parserConfig?: AgentMiddlewareKnowledgebaseDocumentParserConfig
  metadata?: AgentMiddlewareKnowledgebaseDocumentMetadata
}

export type AgentMiddlewareKnowledgebaseDocumentRecord = {
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
  metadata?: AgentMiddlewareKnowledgebaseDocumentMetadata
}

export type AgentMiddlewareKnowledgebaseUploadFileInput = {
  knowledgebaseId: string
  file: AgentMiddlewareKnowledgebaseDocumentFile
  path?: string
  parentId?: string
}

export type AgentMiddlewareKnowledgebaseUploadedFile = {
  name: string
  filePath: string
  fileUrl: string
  mimeType?: string
  size?: number
  sourceHash?: string
}

export type AgentMiddlewareKnowledgebaseCreateDocumentsInput = {
  knowledgebaseId: string
  documents: AgentMiddlewareKnowledgebaseDocumentDraft[]
  parserConfig?: AgentMiddlewareKnowledgebaseDocumentParserConfig
  metadata?: AgentMiddlewareKnowledgebaseDocumentMetadata
  process?: boolean
}

export type AgentMiddlewareKnowledgebaseCreateDocumentsResult = {
  documents: AgentMiddlewareKnowledgebaseDocumentRecord[]
  processingStarted?: boolean
}

export type AgentMiddlewareKnowledgebaseImportArchiveInput = {
  knowledgebaseId: string
  file: AgentMiddlewareKnowledgebaseDocumentFile
  path?: string
  parentId?: string
  packageId?: string
  packageCode?: string
  parserConfig?: AgentMiddlewareKnowledgebaseDocumentParserConfig
  metadata?: AgentMiddlewareKnowledgebaseDocumentMetadata
  process?: boolean
  maxEntries?: number
  maxEntrySizeBytes?: number
  maxDepth?: number
  supportedExtensions?: string[]
}

export type AgentMiddlewareKnowledgebaseImportArchiveResult = {
  archive: AgentMiddlewareKnowledgebaseUploadedFile
  documents: AgentMiddlewareKnowledgebaseDocumentRecord[]
  skipped: Array<{
    path: string
    reason: string
  }>
  warnings: string[]
  processingStarted?: boolean
  unsupported?: boolean
}

export type AgentMiddlewareKnowledgebaseStartProcessingInput = {
  knowledgebaseId?: string
  documentIds: string[]
}

export type AgentMiddlewareKnowledgebaseDocumentStatusInput = {
  knowledgebaseId?: string
  documentIds: string[]
}

export type AgentMiddlewareKnowledgebaseDocumentStatusResult = {
  documents: AgentMiddlewareKnowledgebaseDocumentRecord[]
}

export type AgentMiddlewareKnowledgebaseDeleteDocumentsInput = {
  knowledgebaseId?: string
  documentIds: string[]
}

export type AgentMiddlewareKnowledgebaseDeleteDocumentsResult = {
  knowledgebaseId?: string
  documentIds: string[]
  deletedDocumentCount: number
  missingDocumentIds?: string[]
}

export interface AgentMiddlewareKnowledgebaseDocumentsApi {
  uploadFile(input: AgentMiddlewareKnowledgebaseUploadFileInput): Promise<AgentMiddlewareKnowledgebaseUploadedFile>

  importArchive(
    input: AgentMiddlewareKnowledgebaseImportArchiveInput
  ): Promise<AgentMiddlewareKnowledgebaseImportArchiveResult>

  createDocuments(
    input: AgentMiddlewareKnowledgebaseCreateDocumentsInput
  ): Promise<AgentMiddlewareKnowledgebaseCreateDocumentsResult>

  startProcessing(
    input: AgentMiddlewareKnowledgebaseStartProcessingInput
  ): Promise<AgentMiddlewareKnowledgebaseDocumentStatusResult>

  getDocumentStatus(
    input: AgentMiddlewareKnowledgebaseDocumentStatusInput
  ): Promise<AgentMiddlewareKnowledgebaseDocumentStatusResult>

  deleteDocuments(
    input: AgentMiddlewareKnowledgebaseDeleteDocumentsInput
  ): Promise<AgentMiddlewareKnowledgebaseDeleteDocumentsResult>
}

export const KnowledgebaseDocumentsRuntimeCapability =
  createRuntimeCapability<AgentMiddlewareKnowledgebaseDocumentsApi>('platform.knowledgebase.documents', {
    description: 'Upload, import, create, process, inspect, and delete persistent knowledgebase documents.'
  })
