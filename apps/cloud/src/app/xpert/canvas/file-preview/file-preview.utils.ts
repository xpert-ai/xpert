import { computed, effect, Signal, signal } from '@angular/core'
import { readExcelWorkSheets } from '@xpert-ai/core'
import { TableColumn } from '@xpert-ai/ocap-angular/common'

export const SPREADSHEET_PREVIEW_ROW_LIMIT = 200

export type CanvasFilePreviewKind =
  | 'text'
  | 'code'
  | 'html'
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'spreadsheet'
  | 'unsupported'

export type CanvasFilePreviewInput = {
  contents?: string | null
  extension?: string | null
  filePath?: string | null
  fileType?: string | null
  mimeType?: string | null
  name?: string | null
  url?: string | null
  fileUrl?: string | null
}

export type CanvasFilePreviewSource = {
  contents: string | null
  extension: string | null
  mimeType: string | null
  name: string
  url: string | null
}

export type CanvasSpreadsheetPreviewSheet = {
  columns: TableColumn[]
  name: string
  rows: Record<string, unknown>[]
  totalRows: number
}

export type CanvasSpreadsheetPreview = {
  rowLimit: number
  sheets: CanvasSpreadsheetPreviewSheet[]
}

export type CanvasFilePreviewData = {
  content: string | null
  error: string | null
  spreadsheet: CanvasSpreadsheetPreview | null
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

export function createEmptyCanvasFilePreviewData(): CanvasFilePreviewData {
  return {
    content: null,
    error: null,
    spreadsheet: null
  }
}

export function toCanvasFilePreviewSource(file?: CanvasFilePreviewInput | null): CanvasFilePreviewSource | null {
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

export function resolveCanvasFilePreviewKind(source: CanvasFilePreviewSource | null): CanvasFilePreviewKind {
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

export function canToggleCanvasFilePreview(kind: CanvasFilePreviewKind): boolean {
  return kind === 'text' || kind === 'code' || kind === 'html'
}

export function canCopyCanvasFilePreview(kind: CanvasFilePreviewKind): boolean {
  return canToggleCanvasFilePreview(kind)
}

export function shouldShowCanvasFileExportToPdf(kind: CanvasFilePreviewKind): boolean {
  return kind === 'html'
}

export async function loadCanvasSpreadsheetPreview(
  url: string,
  fileName: string,
  mimeType?: string | null
): Promise<CanvasSpreadsheetPreview> {
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
      columns: toCanvasSpreadsheetColumns(sheet.columns),
      name: sheet.name,
      rows: Array.isArray(sheet.data) ? sheet.data.slice(0, SPREADSHEET_PREVIEW_ROW_LIMIT) : [],
      totalRows: Array.isArray(sheet.data) ? sheet.data.length : 0
    }))
  }
}

export function createCanvasFilePreviewState(
  source: Signal<CanvasFilePreviewSource | null>,
  loadText: (url: string) => Promise<string>
) {
  const previewKind = computed(() => resolveCanvasFilePreviewKind(source()))
  const previewData = signal<CanvasFilePreviewData>(createEmptyCanvasFilePreviewData())
  const previewLoading = signal(false)

  effect(
    (onCleanup) => {
      const currentSource = source()
      const kind = previewKind()
      let active = true

      onCleanup(() => {
        active = false
      })

      previewData.set(createEmptyCanvasFilePreviewData())

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
        void loadCanvasSpreadsheetPreview(currentSource.url, currentSource.name, currentSource.mimeType)
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
    }
  )

  return {
    canCopyPreview: computed(() => canCopyCanvasFilePreview(previewKind())),
    canExportToPdf: computed(() => shouldShowCanvasFileExportToPdf(previewKind())),
    canTogglePreview: computed(() => canToggleCanvasFilePreview(previewKind())),
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
  fallback: Extract<CanvasFilePreviewKind, 'text' | 'code'>
): CanvasFilePreviewKind {
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

function resolveExtensionPreviewKind(extension: string | null): CanvasFilePreviewKind {
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

function toCanvasSpreadsheetColumns(columns: unknown): TableColumn[] {
  if (!Array.isArray(columns)) {
    return []
  }

  return columns.flatMap((column) => {
    const name = getCanvasSpreadsheetColumnName(column)
    return name ? [{ name }] : []
  })
}

function getCanvasSpreadsheetColumnName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('name' in value)) {
    return null
  }

  const { name } = value
  return typeof name === 'string' && name.trim() ? name.trim() : null
}
