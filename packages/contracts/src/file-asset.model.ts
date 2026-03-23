import { FileStorageProviderEnum } from './file-provider'
import { IStorageFile } from './storage-file.model'

export type FileAssetStatus = 'success' | 'partial_success' | 'failed'
export type FileAssetDestinationKind = 'storage' | 'volume' | 'sandbox'
export type FileAssetSourceKind = 'multipart' | 'storage_file' | 'local_file'
export type FileUploadVolumeCatalog = 'projects' | 'users' | 'knowledges' | 'skills'
export type FileUploadSandboxMode = 'mounted_workspace' | 'backend_upload'

export interface IFileAssetSource {
  kind: FileAssetSourceKind
  name?: string
  originalName?: string
  mimeType?: string
  size?: number
  storageFileId?: string
  filePath?: string
  metadata?: Record<string, any>
}

export interface IFileAssetDestination {
  kind: FileAssetDestinationKind
  status: 'success' | 'failed'
  path?: string
  url?: string
  referenceId?: string
  metadata?: Record<string, any>
  error?: string
}

export interface IFileAsset {
  name?: string
  originalName?: string
  mimeType?: string
  size?: number
  status: FileAssetStatus
  metadata?: Record<string, any>
  source?: IFileAssetSource
  destinations: IFileAssetDestination[]
}

export interface IUploadFileStorageTarget {
  kind: 'storage'
  strategy?: string
  provider?: string
  providerOptions?: Record<string, any>
  directory?: string
  fileName?: string
  prefix?: string
  metadata?: Record<string, any>
}

export interface IUploadFileVolumeTarget {
  kind: 'volume'
  strategy?: string
  catalog: FileUploadVolumeCatalog
  projectId?: string
  knowledgeId?: string
  userId?: string
  tenantId?: string
  folder?: string
  fileName?: string
  metadata?: Record<string, any>
}

export interface IUploadFileSandboxTarget {
  kind: 'sandbox'
  strategy?: string
  mode: FileUploadSandboxMode
  workspacePath?: string
  workspaceUrl?: string
  workspaceId?: string
  sandboxUrl?: string
  folder?: string
  fileName?: string
  metadata?: Record<string, any>
}

export type IUploadFileTarget = IUploadFileStorageTarget | IUploadFileVolumeTarget | IUploadFileSandboxTarget

export type TStorageFileAssetDestination = IFileAssetDestination & {
  kind: 'storage'
  referenceId?: IStorageFile['id']
  metadata?: Record<string, any> & {
    storageFile?: IStorageFile
  }
}
