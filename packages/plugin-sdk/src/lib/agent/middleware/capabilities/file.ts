import { createRuntimeCapability } from '../runtime-capability'

export type AgentMiddlewareFileReference = {
  id?: string
  fileId?: string
  fileAssetId?: string
  storageFileId?: string
  name?: string
  originalName?: string
  mimeType?: string
  mimetype?: string
  size?: number
  url?: string
  fileUrl?: string
  previewUrl?: string
}

export type AgentMiddlewareResolvedFile = {
  id: string
  fileId?: string
  fileAssetId?: string
  storageFileId?: string
  name: string
  mimeType?: string
  size?: number
  url: string
  previewUrl?: string
}

export interface AgentMiddlewareFileApi {
  resolveFile(input: AgentMiddlewareFileReference): Promise<AgentMiddlewareResolvedFile | null>
}

export const FileRuntimeCapability = createRuntimeCapability<AgentMiddlewareFileApi>('platform.file', {
  description: 'Resolve platform file handles into previewable file URLs.'
})
