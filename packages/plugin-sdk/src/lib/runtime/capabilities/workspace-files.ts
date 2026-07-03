import { createRuntimeCapability } from '../../core/runtime-capability'

export type WorkspaceFileCatalog = 'projects' | 'users' | 'knowledges' | 'skills' | 'xperts'

export type WorkspaceFileScope = {
  tenantId?: string | null
  userId?: string | null
  catalog?: WorkspaceFileCatalog | null
  scopeId?: string | null
  projectId?: string | null
  knowledgeId?: string | null
  rootId?: string | null
  xpertId?: string | null
  isolateByUser?: boolean | null
}

export type WorkspaceUploadBufferInput = WorkspaceFileScope & {
  buffer: Buffer
  originalName: string
  mimeType?: string | null
  size?: number | null
  folder?: string | null
  fileName?: string | null
  metadata?: Record<string, unknown>
}

export type WorkspaceFileReference = WorkspaceFileScope & {
  filePath: string
}

export type WorkspaceFile = {
  name: string
  filePath: string
  workspacePath: string
  fileUrl?: string
  url?: string
  mimeType?: string
  size?: number
  catalog: WorkspaceFileCatalog
  scopeId?: string
  metadata?: Record<string, unknown>
}

export type WorkspaceFileBuffer = WorkspaceFile & {
  buffer: Buffer
}

export type WorkspaceUnderstandFileInput = WorkspaceFileReference & {
  originalName?: string | null
  mimeType?: string | null
  size?: number | null
  fileUrl?: string | null
  url?: string | null
  purpose?: 'chat_attachment' | 'workspace' | 'knowledge'
  parseMode?: 'auto' | 'fast' | 'deep' | 'none'
  conversationId?: string | null
  threadId?: string | null
  projectId?: string | null
  xpertId?: string | null
  metadata?: Record<string, unknown>
  runInline?: boolean | null
}

export type WorkspaceUnderstoodFile = WorkspaceFile & {
  id: string
  fileId: string
  fileAssetId: string
  storageFileId?: string
  originalName?: string
  status: string
  parseStatus: string
  purpose?: string
  parseMode?: string
  capabilities?: string[]
  summary?: string
}

export interface WorkspaceFilesApi {
  uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile>

  understandFile(input: WorkspaceUnderstandFileInput): Promise<WorkspaceUnderstoodFile>

  readBuffer(input: WorkspaceFileReference): Promise<WorkspaceFileBuffer>

  deleteFile(input: WorkspaceFileReference): Promise<void>
}

export const WorkspaceFilesRuntimeCapability = createRuntimeCapability<WorkspaceFilesApi>('platform.workspace.files', {
  description: 'Upload, understand, read, and delete raw files in Xpert workspace volumes.'
})
