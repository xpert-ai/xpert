import type { AgentFile, IStorageFile } from '@cloud/app/@core'

export type ChatAgentFile = Partial<IStorageFile> &
  Partial<AgentFile> & {
    id: string
    fileAssetId?: string
    objectKey?: string
  }

export type ChatAttachmentStorageFile = ChatAgentFile | IStorageFile

export function isChatAgentFile(
  file: Partial<IStorageFile> | Partial<AgentFile> | null | undefined
): file is ChatAgentFile {
  return typeof file?.id === 'string' && file.id.length > 0
}

export function getChatStorageFileId(file: ChatAttachmentStorageFile): string | undefined {
  if ('storageFileId' in file && file.storageFileId) {
    return file.storageFileId
  }
  if ('fileAssetId' in file && file.fileAssetId) {
    return undefined
  }
  if ('fileId' in file && file.fileId) {
    return undefined
  }
  return typeof file.id === 'string' && file.id.length > 0 ? file.id : undefined
}

export function toStorageAttachmentFile(file: ChatAttachmentStorageFile): IStorageFile {
  const storageFileId = getChatStorageFileId(file)
  const objectKey = 'objectKey' in file ? file.objectKey : undefined
  const mimeType = 'mimeType' in file ? file.mimeType : undefined
  return {
    ...(storageFileId ? { id: storageFileId } : {}),
    file: file.file ?? objectKey ?? file.fileUrl ?? file.url ?? '',
    url: file.fileUrl ?? file.url,
    thumbUrl: file.thumbUrl,
    originalName: file.originalName,
    size: file.size,
    mimetype: file.mimetype ?? mimeType
  }
}

export type ChatRequestAttachmentFile = {
  id: string
  fileAssetId?: string
  fileId?: string
  storageFileId?: string
  originalName?: string
  name?: string
  filePath?: string
  fileUrl?: string
  mimeType?: string
  size?: number
  extension?: string
}

export function toChatRequestFile(file: ChatAgentFile): ChatRequestAttachmentFile {
  const fileAssetId = file.fileAssetId ?? file.fileId
  const storageFileId = file.storageFileId ?? (fileAssetId ? undefined : file.id)
  const id = fileAssetId ?? storageFileId ?? file.id
  const originalName = file.originalName
  const mimeType = file.mimeType ?? file.mimetype
  const fileUrl = file.fileUrl ?? file.url

  return {
    id,
    ...(fileAssetId ? { fileId: fileAssetId, fileAssetId } : {}),
    ...(storageFileId ? { storageFileId } : {}),
    ...(originalName ? { originalName, name: originalName } : {}),
    filePath: file.objectKey ?? file.file,
    fileUrl,
    ...(mimeType ? { mimeType } : {}),
    ...(typeof file.size === 'number' ? { size: file.size } : {}),
    ...(originalName ? { extension: originalName.split('.').pop() } : {})
  }
}
