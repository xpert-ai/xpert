import { type I18nObject, JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { WorkspacePortableFileReference } from './workspace-files'

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
  version?: number
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
  /** Safe transformer provider key resolved from the document parser configuration. */
  processorType?: string | null
  /** Localized label declared by the resolved transformer provider. */
  processorLabel?: I18nObject | null
  knowledgebaseId?: string
  sourceHash?: string | null
  contentHash?: string | null
  tokenNum?: number | null
  chunkNum?: number | null
  disabled?: boolean
  createdAt?: string
  updatedAt?: string
  /** Stable knowledgebase-relative directory containing the document. */
  folderPath?: string | null
  /** Immediate folder document id when the parent relation was requested. */
  parentId?: string | null
  metadata?: KnowledgebaseDocumentMetadata
}

export type KnowledgebaseListDocumentsInput = {
  knowledgebaseId: string
  page?: number
  pageSize?: number
  search?: string
  includeFolders?: boolean
  /** List direct children of this folder. Use null for the knowledgebase root. */
  parentId?: string | null
  /** Restrict results to a stable knowledgebase-relative folder path. */
  folderPath?: string
  /** Defaults to direct. Descendants includes the selected folder and all child folders. */
  folderMode?: 'direct' | 'descendants'
}

export type KnowledgebaseListDocumentsResult = {
  documents: KnowledgebaseDocumentRecord[]
  total: number
  page: number
  pageSize: number
}

export type KnowledgebaseCreateFolderInput = {
  knowledgebaseId: string
  name: string
  parentId?: string | null
}

export type KnowledgebaseCreateFolderResult = {
  knowledgebaseId: string
  folder: KnowledgebaseDocumentRecord
}

export type KnowledgebaseMoveDocumentInput = {
  knowledgebaseId: string
  documentId: string
  parentId?: string | null
  expectedVersion?: number
}

export type KnowledgebaseMoveDocumentResult = {
  knowledgebaseId: string
  document: KnowledgebaseDocumentRecord
  affectedDocumentIds: string[]
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

/**
 * Re-runs authorized Knowledge documents with a replacement parser contract.
 * The host resolves tenant and organization scope from the current runtime;
 * callers cannot move documents between Knowledge bases through this API.
 */
export type KnowledgebaseReprocessDocumentsInput = {
  knowledgebaseId: string
  documentIds: string[]
  parserConfig: KnowledgebaseDocumentParserConfig
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

/** Identifies one standalone image document inside an already authorized Knowledge base. */
export type KnowledgebaseReadImageInput = {
  knowledgebaseId: string
  documentId: string
}

/**
 * Server-only image payload for plugin middleware.
 *
 * The `reference` is suitable for governed file flows, while `buffer` exists
 * only for server-side validation or copying. Never expose either value
 * directly to a model or iframe.
 */
export type KnowledgebaseReadImageResult = {
  knowledgebaseId: string
  documentId: string
  name: string
  mimeType: string
  size: number
  sourceHash?: string | null
  /** Scoped browser/file resolver reference. Never expose it to a model. */
  reference: WorkspacePortableFileReference
  buffer: Buffer
}

export interface KnowledgebaseDocumentsApi {
  listDocuments(input: KnowledgebaseListDocumentsInput): Promise<KnowledgebaseListDocumentsResult>

  createFolder(input: KnowledgebaseCreateFolderInput): Promise<KnowledgebaseCreateFolderResult>

  moveDocument(input: KnowledgebaseMoveDocumentInput): Promise<KnowledgebaseMoveDocumentResult>

  uploadFile(input: KnowledgebaseUploadFileInput): Promise<KnowledgebaseUploadedFile>

  importArchive(input: KnowledgebaseImportArchiveInput): Promise<KnowledgebaseImportArchiveResult>

  createDocuments(input: KnowledgebaseCreateDocumentsInput): Promise<KnowledgebaseCreateDocumentsResult>

  startProcessing(input: KnowledgebaseStartProcessingInput): Promise<KnowledgebaseDocumentStatusResult>

  reprocessDocuments(input: KnowledgebaseReprocessDocumentsInput): Promise<KnowledgebaseDocumentStatusResult>

  getDocumentStatus(input: KnowledgebaseDocumentStatusInput): Promise<KnowledgebaseDocumentStatusResult>

  deleteDocuments(input: KnowledgebaseDeleteDocumentsInput): Promise<KnowledgebaseDeleteDocumentsResult>

  /** Reads original bytes after the host revalidates Knowledge and document scope. */
  readImage(input: KnowledgebaseReadImageInput): Promise<KnowledgebaseReadImageResult>
}

export const KnowledgebaseDocumentsRuntimeCapability = createRuntimeCapability<KnowledgebaseDocumentsApi>(
  'platform.knowledgebase.documents',
  {
    description: 'Upload, import, create, process, reprocess, inspect, and delete persistent knowledgebase documents.'
  }
)
