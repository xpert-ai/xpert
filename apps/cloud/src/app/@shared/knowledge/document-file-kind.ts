import { IKnowledgeDocument, KBDocumentCategoryEnum } from '../../@core/types'

/**
 * UI-level document kind used for icon selection. It intentionally stays broader
 * than backend category/type because uploaded files can carry generic metadata.
 */
export type KnowledgeDocumentFileKind =
  | 'word'
  | 'pdf'
  | 'sheet'
  | 'slide'
  | 'image'
  | 'video'
  | 'audio'
  | 'html'
  | 'markdown'
  | 'text'
  | 'file'

const EXTENSION_KIND: Record<string, KnowledgeDocumentFileKind> = {
  doc: 'word',
  docx: 'word',
  dot: 'word',
  dotx: 'word',
  pdf: 'pdf',
  xls: 'sheet',
  xlsx: 'sheet',
  xlsm: 'sheet',
  xlsb: 'sheet',
  csv: 'sheet',
  ods: 'sheet',
  ppt: 'slide',
  pptx: 'slide',
  pps: 'slide',
  ppsx: 'slide',
  odp: 'slide',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  bmp: 'image',
  mp4: 'video',
  mov: 'video',
  avi: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  flac: 'audio',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  json: 'text',
  yaml: 'text',
  yml: 'text',
  xml: 'text'
}

export function resolveKnowledgeDocumentFileKind(
  document: Partial<IKnowledgeDocument> | null | undefined
): KnowledgeDocumentFileKind {
  // Prefer extension-bearing fields first; MIME/type/category may be generic or stale after import.
  const extension = firstKnownExtension([
    document?.name,
    document?.storageFile?.originalName,
    document?.filePath,
    document?.fileUrl,
    document?.storageFile?.file,
    document?.storageFile?.fileUrl,
    document?.storageFile?.url
  ])
  if (extension) {
    return extension
  }

  const mimeKind = resolveMimeKind(document?.mimeType ?? document?.storageFile?.mimetype)
  if (mimeKind) {
    return mimeKind
  }

  const categoryKind = resolveCategoryKind(document?.category)
  if (categoryKind) {
    return categoryKind
  }

  return resolveTypeKind(document?.type) ?? 'file'
}

function firstKnownExtension(values: Array<string | null | undefined>) {
  for (const value of values) {
    const extension = getExtension(value)
    if (extension && EXTENSION_KIND[extension]) {
      return EXTENSION_KIND[extension]
    }
  }
  return undefined
}

function getExtension(value: string | null | undefined) {
  if (!value?.trim()) {
    return undefined
  }
  // Signed URLs often append query strings, so strip URL decorations before checking the basename.
  const normalized = value.trim().split(/[?#]/)[0]
  const fileName = normalized.split(/[\\/]/).pop() ?? normalized
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return undefined
  }
  return fileName.slice(dotIndex + 1).toLowerCase()
}

function resolveMimeKind(mimeType: string | null | undefined): KnowledgeDocumentFileKind | undefined {
  const mime = mimeType?.toLowerCase() ?? ''
  if (!mime) {
    return undefined
  }
  if (mime.includes('pdf')) {
    return 'pdf'
  }
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) {
    return 'sheet'
  }
  if (mime.includes('presentation') || mime.includes('powerpoint')) {
    return 'slide'
  }
  if (mime.includes('word') || mime.includes('document')) {
    return 'word'
  }
  if (mime.startsWith('image/')) {
    return 'image'
  }
  if (mime.startsWith('video/')) {
    return 'video'
  }
  if (mime.startsWith('audio/')) {
    return 'audio'
  }
  if (mime.includes('html')) {
    return 'html'
  }
  if (mime.includes('markdown')) {
    return 'markdown'
  }
  if (mime.startsWith('text/')) {
    return 'text'
  }
  return undefined
}

function resolveCategoryKind(category: IKnowledgeDocument['category']): KnowledgeDocumentFileKind | undefined {
  switch (category) {
    case KBDocumentCategoryEnum.Image:
      return 'image'
    case KBDocumentCategoryEnum.Video:
      return 'video'
    case KBDocumentCategoryEnum.Audio:
      return 'audio'
    case KBDocumentCategoryEnum.Sheet:
      return 'sheet'
    case KBDocumentCategoryEnum.Text:
      return 'text'
    default:
      return undefined
  }
}

function resolveTypeKind(type: string | null | undefined): KnowledgeDocumentFileKind | undefined {
  const normalized = type?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  if (EXTENSION_KIND[normalized]) {
    return EXTENSION_KIND[normalized]
  }
  return resolveMimeKind(normalized)
}
