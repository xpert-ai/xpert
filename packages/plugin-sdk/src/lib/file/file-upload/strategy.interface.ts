import { IFileAssetDestination, IFileAssetSource, IStorageFile, IUploadFileTarget } from '@metad/contracts'

export type TFileUploadRequestContext = {
  tenantId?: string
  organizationId?: string
  userId?: string
}

export type TResolvedFileUploadSource = {
  name: string
  originalName: string
  mimeType?: string
  size?: number
  buffer: Buffer
  source: IFileAssetSource
  storageFile?: IStorageFile
}

export type TFileUploadContext = {
  request: TFileUploadRequestContext
  metadata?: Record<string, any>
}

export type TStorageProviderType = string

export interface IFileUploadTargetStrategy<TTarget extends IUploadFileTarget = IUploadFileTarget> {
  upload(
    source: TResolvedFileUploadSource,
    target: TTarget,
    context: TFileUploadContext
  ): Promise<IFileAssetDestination>
}
