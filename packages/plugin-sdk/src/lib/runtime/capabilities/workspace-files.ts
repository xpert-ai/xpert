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

export interface WorkspaceFilesApi {
  uploadBuffer(input: WorkspaceUploadBufferInput): Promise<WorkspaceFile>

  readBuffer(input: WorkspaceFileReference): Promise<WorkspaceFileBuffer>

  deleteFile(input: WorkspaceFileReference): Promise<void>
}

export const WorkspaceFilesRuntimeCapability = createRuntimeCapability<WorkspaceFilesApi>('platform.workspace.files', {
  description: 'Upload, read, and delete raw files in Xpert workspace volumes.'
})
