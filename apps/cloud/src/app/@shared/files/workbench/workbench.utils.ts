import { firstValueFrom, isObservable } from 'rxjs'
import type { TFile } from '@xpert-ai/contracts'
import { mapFileLanguageFromPath } from '../editor/editor.component'
import type { FileTreeNode } from '../tree/tree.utils'
import type { FileTreeUploadKind } from '../tree/tree.component'
import type { FilePreviewKind } from '../preview/file-preview.utils'
import type { AsyncValue, FileWorkbenchDownloadPayload, FileWorkbenchReferenceRequest } from './workbench.types'

type FileModifiedTimestamp = NonNullable<TFile['createdAt'] | TFile['updatedAt']>
type FileWithModifiedTimestamp = TFile &
  ({ readonly updatedAt: FileModifiedTimestamp } | { readonly createdAt: FileModifiedTimestamp })

type FileWorkbenchUploadSelection = {
  file: File
  relativePath: string | null
}

export function fileExtension(filePath: string) {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

export function filterFileTree(items: FileTreeNode[], query: string): FileTreeNode[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return items
  }

  return items.flatMap((item) => {
    const itemPath = item.fullPath || item.filePath || ''
    const matches = itemPath.toLocaleLowerCase().includes(normalizedQuery)
    const children = Array.isArray(item.children) ? filterFileTree(item.children as FileTreeNode[], query) : []

    if (!matches && !children.length) {
      return []
    }

    return [
      {
        ...item,
        expanded: children.length > 0 || item.expanded,
        children: children.length ? children : item.children
      }
    ]
  })
}

export function findFileTreeNode(items: FileTreeNode[], filePath?: string | null): FileTreeNode | null {
  const targetPath = normalizeComparableFilePath(filePath)
  if (!targetPath) {
    return null
  }

  for (const item of items ?? []) {
    if (normalizeComparableFilePath(item.fullPath || item.filePath) === targetPath) {
      return item
    }

    if (Array.isArray(item.children)) {
      const child = findFileTreeNode(item.children as FileTreeNode[], targetPath)
      if (child) {
        return child
      }
    }
  }

  return null
}

export function fileModifiedFingerprint(file: TFile | null | undefined): string | null {
  if (!hasFileModifiedTimestamp(file)) {
    return null
  }

  return normalizeFileTimestamp(file.updatedAt ?? file.createdAt)
}

export function hasFileModifiedTimestamp(file: TFile | null | undefined): file is FileWithModifiedTimestamp {
  return isFileModifiedTimestamp(file?.updatedAt) || isFileModifiedTimestamp(file?.createdAt)
}

export function isFileModifiedTimestamp(
  value: FileModifiedTimestamp | number | string | null | undefined
): value is FileModifiedTimestamp {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime())
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  return false
}

export function normalizeFileTimestamp(value: FileModifiedTimestamp | number | string): string {
  if (value instanceof Date) {
    return String(value.getTime())
  }

  if (typeof value === 'number') {
    return String(value)
  }

  const timestamp = value.trim()
  const time = Date.parse(timestamp)
  return Number.isNaN(time) ? timestamp : String(time)
}

export function normalizeComparableFilePath(filePath?: string | null) {
  return (filePath ?? '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

export function isPathSameOrDescendant(parentPath?: string | null, childPath?: string | null) {
  const parent = normalizeComparableFilePath(parentPath)
  const child = normalizeComparableFilePath(childPath)
  return !!parent && !!child && (child === parent || child.startsWith(`${parent}/`))
}

export function normalizeReferencePath(filePath?: string | null) {
  return (filePath ?? '').trim().replace(/\\/g, '/') || null
}

export function fileNameFromPath(filePath: string) {
  return filePath.split('/').pop() || filePath
}

export function parentDirectoryPath(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

/**
 * Formats relative directory path for display.
 */
export function formatDirectoryPath(path: string) {
  return path ? `./${path}` : './'
}

export function resolveUploadTargetPath(selection: { path: string; isDirectory: boolean } | null) {
  if (!selection?.path) {
    return ''
  }

  return selection.isDirectory ? selection.path : parentDirectoryPath(selection.path)
}

export function normalizeDownloadUrl(url?: string | null) {
  if (!url) {
    return null
  }

  return /^(https?:)?\/\//.test(url) || url.startsWith('/') || url.startsWith('blob:') ? url : null
}

export function revokeObjectUrl(url?: string | null) {
  if (typeof URL === 'undefined' || !url || !url.startsWith('blob:')) {
    return
  }

  URL.revokeObjectURL(url)
}

export function requiresPreviewUrl(previewKind: FilePreviewKind, hasContents: boolean) {
  if (previewKind === 'text' || previewKind === 'code' || previewKind === 'html') {
    return !hasContents
  }

  return (
    previewKind === 'document' ||
    previewKind === 'presentation' ||
    previewKind === 'image' ||
    previewKind === 'pdf' ||
    previewKind === 'audio' ||
    previewKind === 'video' ||
    previewKind === 'spreadsheet'
  )
}

export function createDownloadPayload(
  file: TFile | null | undefined,
  filePath: string,
  item?: FileTreeNode
): FileWorkbenchDownloadPayload | null {
  if (!file && !item) {
    return null
  }

  const fileName = fileNameFromPath(file?.filePath || filePath)
  const url = normalizeDownloadUrl(file?.fileUrl || file?.url || item?.url)
  if (url) {
    return {
      kind: 'url',
      url,
      fileName
    }
  }

  if (typeof file?.contents === 'string') {
    return {
      kind: 'blob',
      blob: new Blob([file.contents], {
        type: file.mimeType || 'text/plain;charset=utf-8'
      }),
      fileName
    }
  }

  return null
}

export function triggerFileDownload(payload: FileWorkbenchDownloadPayload, fallbackPath: string) {
  if (payload.kind === 'url') {
    const anchor = document.createElement('a')
    anchor.href = payload.url.startsWith('blob:') ? payload.url : appendDownloadQuery(payload.url)
    anchor.target = '_blank'
    anchor.rel = 'noopener'
    anchor.download = payload.fileName || fileNameFromPath(fallbackPath)
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    return
  }

  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(payload.blob)
  anchor.href = objectUrl
  anchor.download = payload.fileName || fileNameFromPath(fallbackPath)
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

export function appendDownloadQuery(url: string) {
  const normalizedUrl = new URL(url, window.location.origin)
  normalizedUrl.searchParams.set('download', '1')
  return normalizedUrl.toString()
}

export function createReferenceRequest(
  path: string,
  text: string,
  startLine: number,
  endLine: number
): FileWorkbenchReferenceRequest {
  const language = mapFileLanguageFromPath(path)

  return {
    path,
    text,
    startLine,
    endLine,
    ...(language !== 'plaintext' ? { language } : {})
  }
}

export function readSelectedFiles(event: Event, kind: FileTreeUploadKind): FileWorkbenchUploadSelection[] {
  const input = event.target instanceof HTMLInputElement ? event.target : null
  if (!input?.files) {
    return []
  }

  return Array.from(input.files).map((file) => ({
    file,
    relativePath: kind === 'folder' ? normalizeUploadRelativePath(file.webkitRelativePath) : null
  }))
}

export function normalizeUploadRelativePath(relativePath?: string | null) {
  const normalized = (relativePath ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '')

  return normalized || null
}

export function resolveUploadDestinationPath(targetPath: string, relativePath?: string | null) {
  const normalizedTargetPath = normalizeReferencePath(targetPath) ?? ''
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  const relativeDirectoryPath = normalizedRelativePath ? parentDirectoryPath(normalizedRelativePath) : ''
  return [normalizedTargetPath, relativeDirectoryPath].filter(Boolean).join('/')
}

export async function resolveAsyncValue<T>(value: AsyncValue<T>): Promise<T> {
  if (isObservable(value)) {
    return firstValueFrom(value)
  }
  return Promise.resolve(value)
}
