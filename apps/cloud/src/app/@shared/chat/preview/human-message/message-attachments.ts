import type { IChatMessage } from '@cloud/app/@core'
import type { ChatAttachmentStorageFile } from '../../attachments/agent-file'
import type { XpertChatReference } from '../../references'

export type HumanMessageAttachment = {
  file?: File
  url?: string
  storageFile?: ChatAttachmentStorageFile
}

type FileLikeRecord = Record<string, unknown>

function isRecord(value: unknown): value is FileLikeRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readNestedRecord(value: FileLikeRecord, key: string): FileLikeRecord | null {
  const nested = value[key]
  return isRecord(nested) ? nested : null
}

function readFileUrl(value: FileLikeRecord) {
  return (
    readString(value['url']) ??
    readString(value['fileUrl']) ??
    readString(value['previewUrl']) ??
    readString(value['thumbUrl'])
  )
}

function readFileName(value: FileLikeRecord) {
  return readString(value['originalName']) ?? readString(value['name']) ?? readString(value['fileName'])
}

function readMimeType(value: FileLikeRecord) {
  return readString(value['mimeType']) ?? readString(value['mimetype']) ?? readString(value['mime_type'])
}

function readFileExtension(value: string | undefined): string | undefined {
  if (!value || value.startsWith('data:')) {
    return undefined
  }

  const path = value.split(/[?#]/)[0]
  const name = path.split('/').pop() ?? path
  const dotIndex = name.lastIndexOf('.')

  return dotIndex > -1 && dotIndex < name.length - 1 ? name.slice(dotIndex + 1).toLowerCase() : undefined
}

function readUrlFileName(value: string | undefined): string | undefined {
  if (!value || value.startsWith('data:')) {
    return undefined
  }

  const path = value.split(/[?#]/)[0]
  const name = path.split('/').pop()

  if (!name) {
    return undefined
  }

  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

function toAttachmentStorageFile(value: unknown, fallbackId?: string): ChatAttachmentStorageFile | null {
  if (!isRecord(value)) {
    return null
  }

  const metadataStorageFile = readNestedRecord(readNestedRecord(value, 'metadata') ?? {}, 'storageFile')
  const source = metadataStorageFile ? { ...metadataStorageFile, ...value } : value
  const id =
    readString(source['id']) ??
    readString(source['fileId']) ??
    readString(source['fileAssetId']) ??
    readString(source['storageFileId']) ??
    fallbackId
  const originalName = readFileName(source)
  const url = readFileUrl(source)
  const mimeType = readMimeType(source)
  const filePath =
    readString(source['file']) ??
    readString(source['objectKey']) ??
    readString(source['workspacePath']) ??
    readString(source['filePath']) ??
    url ??
    originalName ??
    id

  if (!id && !originalName && !url && !filePath) {
    return null
  }

  return {
    ...(source as Partial<ChatAttachmentStorageFile>),
    id: id ?? filePath ?? originalName ?? url,
    ...(readString(source['fileId']) ? { fileId: readString(source['fileId']) } : {}),
    ...(readString(source['fileAssetId']) ? { fileAssetId: readString(source['fileAssetId']) } : {}),
    ...(readString(source['storageFileId']) ? { storageFileId: readString(source['storageFileId']) } : {}),
    file: filePath ?? '',
    ...(url ? { url, fileUrl: readString(source['fileUrl']) ?? url } : {}),
    ...(originalName ? { originalName } : {}),
    ...(mimeType ? { mimeType, mimetype: mimeType } : {}),
    ...(readNumber(source['size']) !== undefined ? { size: readNumber(source['size']) } : {})
  } as ChatAttachmentStorageFile
}

function getAttachmentKey(item: HumanMessageAttachment): string {
  const file = item.storageFile as FileLikeRecord | undefined
  return (
    readString(file?.['fileAssetId']) ??
    readString(file?.['fileId']) ??
    readString(file?.['storageFileId']) ??
    readString(file?.['id']) ??
    item.file?.name ??
    item.url ??
    ''
  )
}

export function getHumanMessageAttachmentKey(item: HumanMessageAttachment, index: number): string | number {
  return getAttachmentKey(item) || index
}

export function getHumanMessageAttachmentName(item: HumanMessageAttachment): string {
  const storageFile = item.storageFile as FileLikeRecord | undefined
  const storageUrl = storageFile ? readFileUrl(storageFile) : undefined
  const storagePath = readString(storageFile?.['file']) ?? readString(storageFile?.['objectKey'])

  return (
    (storageFile ? readFileName(storageFile) : undefined) ??
    item.file?.name ??
    readUrlFileName(storageUrl) ??
    readUrlFileName(item.url) ??
    readUrlFileName(storagePath) ??
    storagePath ??
    'Attachment'
  )
}

export function getHumanMessageAttachmentMimeType(item: HumanMessageAttachment): string | undefined {
  const storageFile = item.storageFile as FileLikeRecord | undefined
  return (storageFile ? readMimeType(storageFile) : undefined) ?? item.file?.type
}

export function getHumanMessageAttachmentPreviewUrl(item: HumanMessageAttachment): string | undefined {
  const storageFile = item.storageFile as FileLikeRecord | undefined

  // Prefer thumbnails for the compact square tile, then fall back to the full file URL.
  return (
    readString(storageFile?.['thumbUrl']) ??
    readString(storageFile?.['previewUrl']) ??
    readString(storageFile?.['fileUrl']) ??
    readString(storageFile?.['url']) ??
    readString(item.url)
  )
}

export function getHumanMessageAttachmentExtension(item: HumanMessageAttachment): string {
  const storageFile = item.storageFile as FileLikeRecord | undefined
  const explicitExtension = readString(storageFile?.['extension'])
  const extension =
    explicitExtension ??
    readFileExtension(getHumanMessageAttachmentName(item)) ??
    readFileExtension(getHumanMessageAttachmentPreviewUrl(item)) ??
    getHumanMessageAttachmentMimeType(item)?.split('/').pop()

  return extension ? extension.toUpperCase() : 'FILE'
}

export function isHumanMessageAttachmentImage(item: HumanMessageAttachment): boolean {
  const mimeType = getHumanMessageAttachmentMimeType(item)
  const extension =
    readFileExtension(getHumanMessageAttachmentName(item)) ??
    readFileExtension(getHumanMessageAttachmentPreviewUrl(item))

  return !!mimeType?.startsWith('image/') || !!extension?.match(/^(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/)
}

function addAttachment(items: HumanMessageAttachment[], seen: Set<string>, item: HumanMessageAttachment) {
  const key = getAttachmentKey(item)
  if (key && seen.has(key)) {
    return
  }
  if (key) {
    seen.add(key)
  }
  items.push(item)
}

function imageReferenceToAttachment(reference: XpertChatReference): HumanMessageAttachment | null {
  if (reference.type !== 'image') {
    return null
  }

  const file = toAttachmentStorageFile(
    {
      id: reference.id ?? reference.fileId,
      fileId: reference.fileId,
      storageFileId: reference.fileId,
      url: reference.url,
      originalName: reference.name ?? reference.label ?? 'Pasted image',
      mimeType: reference.mimeType,
      size: reference.size
    },
    reference.url ?? reference.text
  )

  if (!file && !reference.url) {
    return null
  }

  return {
    ...(reference.url ? { url: reference.url } : {}),
    ...(file ? { storageFile: file } : {})
  }
}

function contentImageUrlToAttachment(content: FileLikeRecord, index: number): HumanMessageAttachment | null {
  if (content['type'] !== 'image_url') {
    return null
  }

  const imageUrl = isRecord(content['image_url'])
    ? readString((content['image_url'] as FileLikeRecord)['url'])
    : readString(content['image_url'])

  if (!imageUrl) {
    return null
  }

  return {
    url: imageUrl,
    storageFile: {
      id: readString(content['id']) ?? `image-url-${index}`,
      file: imageUrl,
      url: imageUrl,
      originalName: readString(content['name']) ?? 'Pasted image',
      mimeType: 'image/*',
      mimetype: 'image/*'
    } as ChatAttachmentStorageFile
  }
}

function contentFileToAttachment(content: FileLikeRecord, index: number): HumanMessageAttachment | null {
  const type = readString(content['type'])
  if (type !== 'file' && type !== 'input_file' && type !== 'artifact') {
    return null
  }

  const file = toAttachmentStorageFile(content, `content-file-${index}`)
  return file ? { storageFile: file } : null
}

export function getHumanMessageAttachmentList(message: IChatMessage | null | undefined): HumanMessageAttachment[] {
  const items: HumanMessageAttachment[] = []
  const seen = new Set<string>()

  for (const file of message?.fileAssets ?? []) {
    const storageFile = toAttachmentStorageFile(file)
    if (storageFile) {
      addAttachment(items, seen, { storageFile })
    }
  }

  for (const storageFile of message?.attachments ?? []) {
    addAttachment(items, seen, { storageFile })
  }

  for (const reference of message?.references ?? []) {
    const attachment = imageReferenceToAttachment(reference)
    if (attachment) {
      addAttachment(items, seen, attachment)
    }
  }

  const content = message?.content
  const contentItems = Array.isArray(content) ? content : isRecord(content) ? [content] : []
  contentItems.forEach((item, index) => {
    const attachment = contentImageUrlToAttachment(item, index) ?? contentFileToAttachment(item, index)
    if (attachment) {
      addAttachment(items, seen, attachment)
    }
  })

  return items
}

export function getHumanMessageReferenceList(message: IChatMessage | null | undefined): XpertChatReference[] {
  return (message?.references ?? []).filter((reference) => reference.type !== 'image')
}

export function getHumanMessageTextContent(message: IChatMessage | null | undefined): string {
  const content = message?.content
  if (typeof content === 'string') {
    return content
  }

  const contentItems = Array.isArray(content) ? content : isRecord(content) ? [content] : []
  return contentItems
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }
      return isRecord(item) && typeof item['text'] === 'string' ? item['text'] : ''
    })
    .filter((text) => text.length > 0)
    .join('\n')
}
