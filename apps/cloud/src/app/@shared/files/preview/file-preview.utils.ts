import { computed, effect, Signal, signal } from '@angular/core'
import { readExcelWorkSheets } from '@xpert-ai/core'
import { TableColumn } from '@xpert-ai/ocap-angular/common'

export const SPREADSHEET_PREVIEW_ROW_LIMIT = 200

export type FilePreviewKind =
  | 'text'
  | 'code'
  | 'html'
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'spreadsheet'
  | 'unsupported'

export type FilePreviewInput = {
  contents?: string | null
  extension?: string | null
  filePath?: string | null
  fileType?: string | null
  mimeType?: string | null
  name?: string | null
  url?: string | null
  fileUrl?: string | null
}

export type FilePreviewSource = {
  contents: string | null
  extension: string | null
  mimeType: string | null
  name: string
  url: string | null
}

export type SpreadsheetPreviewSheet = {
  columns: TableColumn[]
  name: string
  rows: Record<string, unknown>[]
  totalRows: number
}

export type SpreadsheetPreview = {
  rowLimit: number
  sheets: SpreadsheetPreviewSheet[]
}

export type FilePreviewData = {
  content: string | null
  error: string | null
  spreadsheet: SpreadsheetPreview | null
}

const CODE_EXTENSIONS = new Set(['js', 'ts', 'py', 'java', 'css', 'cpp'])
const TEXT_EXTENSIONS = new Set(['txt', 'md'])
const HTML_EXTENSIONS = new Set(['html', 'htm', 'jsx'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'avi', 'mov', 'wmv', 'webm'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac'])
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'xls', 'xlsx'])
const SPREADSHEET_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
])
const CODE_MIME_TYPES = new Set([
  'application/javascript',
  'application/json',
  'application/typescript',
  'application/xml',
  'text/css'
])
const TEXT_MIME_TYPES = new Set(['application/markdown', 'text/markdown', 'text/plain'])

export function createEmptyFilePreviewData(): FilePreviewData {
  return {
    content: null,
    error: null,
    spreadsheet: null
  }
}

export function toFilePreviewSource(file?: FilePreviewInput | null): FilePreviewSource | null {
  if (!file) {
    return null
  }

  const name = normalizeFileName(file.name || file.filePath)
  const extension = normalizeExtension(file.extension || name)
  const mimeType = normalizeMimeType(file.mimeType || (looksLikeMimeType(file.fileType) ? file.fileType : null))
  const url = normalizeUrl(file.url || file.fileUrl)

  return {
    contents: typeof file.contents === 'string' ? file.contents : null,
    extension,
    mimeType,
    name,
    url
  }
}

export function resolveFilePreviewKind(source: FilePreviewSource | null): FilePreviewKind {
  if (!source) {
    return 'unsupported'
  }

  const mimeType = source.mimeType
  if (mimeType?.startsWith('image/')) {
    return 'image'
  }
  if (mimeType?.startsWith('video/')) {
    return 'video'
  }
  if (mimeType?.startsWith('audio/')) {
    return 'audio'
  }
  if (mimeType === 'application/pdf') {
    return 'pdf'
  }
  if (mimeType === 'text/html') {
    return 'html'
  }
  if (mimeType && SPREADSHEET_MIME_TYPES.has(mimeType)) {
    return 'spreadsheet'
  }
  if (mimeType && CODE_MIME_TYPES.has(mimeType)) {
    return resolveTextualPreviewKind(source.extension, 'code')
  }
  if (mimeType && (TEXT_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/'))) {
    return resolveTextualPreviewKind(source.extension, 'text')
  }

  return resolveExtensionPreviewKind(source.extension)
}

export function canToggleFilePreview(kind: FilePreviewKind): boolean {
  return kind === 'text' || kind === 'code' || kind === 'html'
}

export function canCopyFilePreview(kind: FilePreviewKind): boolean {
  return canToggleFilePreview(kind)
}

export function shouldShowFileExportToPdf(kind: FilePreviewKind): boolean {
  return kind === 'html'
}

export async function loadSpreadsheetPreview(
  url: string,
  fileName: string,
  mimeType?: string | null
): Promise<SpreadsheetPreview> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet preview: ${response.status}`)
  }

  const blob = await response.blob()
  const file = new File([blob], fileName || 'spreadsheet', {
    type: mimeType || blob.type || 'application/octet-stream'
  })
  const sheets = await readExcelWorkSheets<Record<string, unknown>>(file)

  return {
    rowLimit: SPREADSHEET_PREVIEW_ROW_LIMIT,
    sheets: sheets.map((sheet) => ({
      columns: toSpreadsheetColumns(sheet.columns),
      name: sheet.name,
      rows: Array.isArray(sheet.data) ? sheet.data.slice(0, SPREADSHEET_PREVIEW_ROW_LIMIT) : [],
      totalRows: Array.isArray(sheet.data) ? sheet.data.length : 0
    }))
  }
}

export function createFilePreviewState(
  source: Signal<FilePreviewSource | null>,
  loadText: (url: string) => Promise<string>
) {
  const previewKind = computed(() => resolveFilePreviewKind(source()))
  const previewData = signal<FilePreviewData>(createEmptyFilePreviewData())
  const previewLoading = signal(false)

  effect((onCleanup) => {
    const currentSource = source()
    const kind = previewKind()
    let active = true

    onCleanup(() => {
      active = false
    })

    previewData.set(createEmptyFilePreviewData())

    if (!currentSource) {
      previewLoading.set(false)
      return
    }

    if (kind === 'text' || kind === 'code' || kind === 'html') {
      if (currentSource.contents !== null) {
        previewLoading.set(false)
        previewData.set({
          content: currentSource.contents,
          error: null,
          spreadsheet: null
        })
        return
      }

      if (!currentSource.url) {
        previewLoading.set(false)
        previewData.set({
          content: null,
          error: 'missing-url',
          spreadsheet: null
        })
        return
      }

      previewLoading.set(true)
      void loadText(currentSource.url)
        .then((content) => {
          if (!active) {
            return
          }

          previewData.set({
            content,
            error: null,
            spreadsheet: null
          })
          previewLoading.set(false)
        })
        .catch(() => {
          if (!active) {
            return
          }

          previewData.set({
            content: null,
            error: 'load-failed',
            spreadsheet: null
          })
          previewLoading.set(false)
        })
      return
    }

    if (kind === 'spreadsheet') {
      if (!currentSource.url) {
        previewLoading.set(false)
        previewData.set({
          content: null,
          error: 'missing-url',
          spreadsheet: null
        })
        return
      }

      previewLoading.set(true)
      void loadSpreadsheetPreview(currentSource.url, currentSource.name, currentSource.mimeType)
        .then((spreadsheet) => {
          if (!active) {
            return
          }

          previewData.set({
            content: null,
            error: null,
            spreadsheet
          })
          previewLoading.set(false)
        })
        .catch(() => {
          if (!active) {
            return
          }

          previewData.set({
            content: null,
            error: 'load-failed',
            spreadsheet: null
          })
          previewLoading.set(false)
        })
      return
    }

    previewLoading.set(false)
  })

  return {
    canCopyPreview: computed(() => canCopyFilePreview(previewKind())),
    canExportToPdf: computed(() => shouldShowFileExportToPdf(previewKind())),
    canTogglePreview: computed(() => canToggleFilePreview(previewKind())),
    content: computed(() => previewData().content),
    previewData,
    previewError: computed(() => previewData().error),
    previewKind,
    previewLoading,
    spreadsheet: computed(() => previewData().spreadsheet)
  }
}

function resolveTextualPreviewKind(
  extension: string | null,
  fallback: Extract<FilePreviewKind, 'text' | 'code'>
): FilePreviewKind {
  if (extension && HTML_EXTENSIONS.has(extension)) {
    return 'html'
  }
  if (extension && CODE_EXTENSIONS.has(extension)) {
    return 'code'
  }
  if (extension && TEXT_EXTENSIONS.has(extension)) {
    return 'text'
  }

  return fallback
}

function resolveExtensionPreviewKind(extension: string | null): FilePreviewKind {
  if (!extension) {
    return 'unsupported'
  }

  if (HTML_EXTENSIONS.has(extension)) {
    return 'html'
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return 'code'
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return 'text'
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return 'spreadsheet'
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image'
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video'
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'audio'
  }
  if (extension === 'pdf') {
    return 'pdf'
  }

  return 'unsupported'
}

function normalizeExtension(value?: string | null) {
  const normalized = value?.trim().replace(/^\./, '') || ''
  if (!normalized) {
    return null
  }

  const pathExtension = normalized.includes('.') ? normalized.split('.').pop() : normalized
  return pathExtension?.toLowerCase() || null
}

function normalizeFileName(value?: string | null) {
  return value?.trim() || 'file'
}

function normalizeMimeType(value?: string | null) {
  const normalized = value?.split(';')[0]?.trim().toLowerCase()
  return normalized || null
}

function normalizeUrl(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function looksLikeMimeType(value?: string | null) {
  return typeof value === 'string' && value.includes('/')
}

function toSpreadsheetColumns(columns: unknown): TableColumn[] {
  if (!Array.isArray(columns)) {
    return []
  }

  return columns.flatMap((column) => {
    const name = getSpreadsheetColumnName(column)
    return name ? [{ name }] : []
  })
}

function getSpreadsheetColumnName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('name' in value)) {
    return null
  }

  const { name } = value
  return typeof name === 'string' && name.trim() ? name.trim() : null
}
