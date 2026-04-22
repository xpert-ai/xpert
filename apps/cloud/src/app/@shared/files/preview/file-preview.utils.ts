import { computed, effect, Signal, signal } from '@angular/core'
import { TableColumn } from '@xpert-ai/ocap-angular/common'

export const SPREADSHEET_PREVIEW_ROW_LIMIT = 200

export type FilePreviewKind =
  | 'text'
  | 'code'
  | 'html'
  | 'document'
  | 'presentation'
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
  previewText?: string | null
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
  documentHtml: string | null
  error: string | null
  spreadsheet: SpreadsheetPreview | null
}

const CODE_EXTENSIONS = new Set(['js', 'ts', 'py', 'java', 'css', 'cpp'])
const TEXT_EXTENSIONS = new Set(['txt', 'md'])
const HTML_EXTENSIONS = new Set(['html', 'htm', 'jsx'])
const DOCUMENT_EXTENSIONS = new Set(['docx'])
const PRESENTATION_EXTENSIONS = new Set(['pptx'])
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'avi', 'mov', 'wmv', 'webm'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac'])
const SPREADSHEET_EXTENSIONS = new Set(['csv', 'xls', 'xlsx'])
const DOCUMENT_MIME_TYPES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const PRESENTATION_MIME_TYPES = new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation'])
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
    documentHtml: null,
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
    contents:
      typeof file.contents === 'string'
        ? file.contents
        : typeof file.previewText === 'string'
          ? file.previewText
          : null,
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
  if (mimeType && DOCUMENT_MIME_TYPES.has(mimeType)) {
    return 'document'
  }
  if (mimeType && PRESENTATION_MIME_TYPES.has(mimeType)) {
    return 'presentation'
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
  const { workbook, sheetToJson } = await readSpreadsheetWorkbook(blob, fileName, mimeType)
  const sheets = workbook.SheetNames.map((sheetName) =>
    toSpreadsheetPreviewSheet(workbook.Sheets[sheetName], sheetName, sheetToJson)
  )

  return {
    rowLimit: SPREADSHEET_PREVIEW_ROW_LIMIT,
    sheets
  }
}

export async function loadDocumentPreview(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch document preview: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      idPrefix: 'xp-docx-',
      ignoreEmptyParagraphs: false
    }
  )

  const html = normalizeDocumentPreviewHtml(result.value)
  if (!html) {
    throw new Error('Failed to generate document preview')
  }

  return html
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
          documentHtml: null,
          error: null,
          spreadsheet: null
        })
        return
      }

      if (!currentSource.url) {
        previewLoading.set(false)
        previewData.set({
          content: null,
          documentHtml: null,
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
            documentHtml: null,
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
            documentHtml: null,
            error: 'load-failed',
            spreadsheet: null
          })
          previewLoading.set(false)
        })
      return
    }

    if (kind === 'document') {
      if (!currentSource.url) {
        previewLoading.set(false)
        previewData.set({
          content: currentSource.contents,
          documentHtml: null,
          error: currentSource.contents !== null ? null : 'missing-preview-content',
          spreadsheet: null
        })
        return
      }

      previewLoading.set(true)
      void loadDocumentPreview(currentSource.url)
        .then((documentHtml) => {
          if (!active) {
            return
          }

          previewData.set({
            content: currentSource.contents,
            documentHtml,
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
            content: currentSource.contents,
            documentHtml: null,
            error: currentSource.contents !== null ? null : 'load-failed',
            spreadsheet: null
          })
          previewLoading.set(false)
        })
      return
    }

    if (kind === 'presentation') {
      previewLoading.set(false)
      previewData.set({
        content: currentSource.contents,
        documentHtml: null,
        error: currentSource.contents !== null ? null : 'missing-preview-content',
        spreadsheet: null
      })
      return
    }

    if (kind === 'spreadsheet') {
      if (!currentSource.url) {
        previewLoading.set(false)
        previewData.set({
          content: null,
          documentHtml: null,
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
            documentHtml: null,
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
            documentHtml: null,
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
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return 'document'
  }
  if (PRESENTATION_EXTENSIONS.has(extension)) {
    return 'presentation'
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

function normalizeDocumentPreviewHtml(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

async function blobToArrayBuffer(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
        return
      }

      reject(new Error('Failed to read spreadsheet preview blob'))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('Failed to read spreadsheet preview blob'))
    }
    reader.readAsArrayBuffer(blob)
  })
}

async function readSpreadsheetWorkbook(blob: Blob, fileName: string, mimeType?: string | null) {
  const XLSX = await import('xlsx')
  const sheetToJson = (worksheet: unknown, options: Record<string, unknown>) =>
    XLSX.utils.sheet_to_json(worksheet, options) as unknown[][]

  if (isCsvFile(fileName, mimeType || blob.type)) {
    const content = await blob.text()
    return {
      workbook: XLSX.read(content, { type: 'string' }),
      sheetToJson
    }
  }

  const arrayBuffer = await blobToArrayBuffer(blob)
  return {
    workbook: XLSX.read(arrayBuffer, {
      type: 'array',
      cellDates: true,
      cellNF: false
    }),
    sheetToJson
  }
}

function toSpreadsheetPreviewSheet(
  worksheet: unknown,
  sheetName: string,
  sheetToJson: (worksheet: unknown, options: Record<string, unknown>) => unknown[][]
): SpreadsheetPreviewSheet {
  const rows = toSpreadsheetMatrix(worksheet, sheetToJson)
  const maxColumnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const columnNames = Array.from({ length: maxColumnCount }, (_, index) => spreadsheetColumnLabel(index))

  return {
    columns: toSpreadsheetColumns(columnNames),
    name: sheetName,
    rows: rows.slice(0, SPREADSHEET_PREVIEW_ROW_LIMIT).map((row) => toSpreadsheetPreviewRow(row, columnNames)),
    totalRows: rows.length
  }
}

function toSpreadsheetMatrix(
  worksheet: unknown,
  sheetToJson: (worksheet: unknown, options: Record<string, unknown>) => unknown[][]
): unknown[][] {
  if (!worksheet || typeof worksheet !== 'object') {
    return []
  }

  return sheetToJson(worksheet, {
    blankrows: false,
    defval: '',
    header: 1,
    raw: true
  }).map((row) => (Array.isArray(row) ? row : []))
}

function toSpreadsheetPreviewRow(row: unknown[], columnNames: string[]) {
  return columnNames.reduce<Record<string, unknown>>((record, columnName, index) => {
    record[columnName] = normalizeSpreadsheetCell(row[index])
    return record
  }, {})
}

function normalizeSpreadsheetCell(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return value ?? ''
}

function spreadsheetColumnLabel(index: number) {
  let current = index
  let label = ''

  while (current >= 0) {
    label = String.fromCharCode(65 + (current % 26)) + label
    current = Math.floor(current / 26) - 1
  }

  return label
}

function isCsvFile(fileName: string, mimeType?: string | null) {
  return normalizeExtension(fileName) === 'csv' || normalizeMimeType(mimeType) === 'text/csv'
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
    return name ? [{ name, maxWidth: '200px' }] : []
  })
}

function getSpreadsheetColumnName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (!value || typeof value !== 'object' || !('name' in value)) {
    return null
  }

  const { name } = value
  return typeof name === 'string' && name.trim() ? name.trim() : null
}
