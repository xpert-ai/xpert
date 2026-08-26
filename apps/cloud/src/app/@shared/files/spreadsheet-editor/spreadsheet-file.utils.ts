import type { CellObject, ColInfo, RowInfo, WorkBook, WorkSheet } from 'xlsx'
import type {
  BooleanNumber,
  CellValueType,
  ICellData,
  IColumnData,
  IObjectMatrixPrimitiveType,
  IRowData,
  IStyleData,
  LocaleType,
  IWorkbookData,
  IWorksheetData
} from '@univerjs/presets'

export const SPREADSHEET_EDITOR_EXTENSIONS = ['csv', 'xls', 'xlsx'] as const

type SpreadsheetEditorExtension = (typeof SPREADSHEET_EDITOR_EXTENSIONS)[number]

const DEFAULT_ROW_COUNT = 100
const DEFAULT_COLUMN_COUNT = 26
const BOOLEAN_FALSE = 0 as BooleanNumber
const BOOLEAN_TRUE = 1 as BooleanNumber
const CELL_VALUE_TYPE_STRING = 1 as CellValueType
const CELL_VALUE_TYPE_NUMBER = 2 as CellValueType
const CELL_VALUE_TYPE_BOOLEAN = 3 as CellValueType
const LOCALE_ZH_CN = 'zhCN' as LocaleType

export function isSpreadsheetEditorFile(filePath: string | null | undefined) {
  return SPREADSHEET_EDITOR_EXTENSIONS.includes(fileExtension(filePath) as SpreadsheetEditorExtension)
}

export async function importSpreadsheetFile(blob: Blob, fileName: string): Promise<IWorkbookData> {
  const XLSX = await import('xlsx')
  const source = fileExtension(fileName) === 'csv' ? await readBlobText(blob) : await readBlobArrayBuffer(blob)
  const workbook = XLSX.read(source, {
    type: typeof source === 'string' ? 'string' : 'array',
    cellDates: false,
    cellFormula: true,
    cellNF: true,
    cellStyles: true
  })

  return sheetJsWorkbookToUniver(workbook, fileName)
}

export async function exportSpreadsheetFile(snapshot: IWorkbookData, fileName: string): Promise<File> {
  const XLSX = await import('xlsx')
  const extension = spreadsheetEditorExtension(fileName)
  const workbook = univerWorkbookToSheetJs(snapshot)

  if (extension === 'csv') {
    if (workbook.SheetNames.length !== 1) {
      throw new Error('CSV files can only store one worksheet. Remove additional worksheets before saving.')
    }

    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    return new File([csv], fileName, { type: spreadsheetMimeType(extension) })
  }

  const output: unknown = XLSX.write(workbook, {
    bookType: extension,
    cellStyles: true,
    type: 'array'
  })
  const blobParts = toBlobParts(output)
  return new File(blobParts, fileName, { type: spreadsheetMimeType(extension) })
}

export function sheetJsWorkbookToUniver(workbook: WorkBook, fileName: string): IWorkbookData {
  const sheets: IWorkbookData['sheets'] = {}
  const sheetOrder: string[] = []

  workbook.SheetNames.forEach((sheetName, index) => {
    const sheetId = `sheet-${index + 1}`
    const worksheet = workbook.Sheets[sheetName] ?? {}
    sheetOrder.push(sheetId)
    sheets[sheetId] = sheetJsWorksheetToUniver(worksheet, sheetId, sheetName)
  })

  if (!sheetOrder.length) {
    const sheetId = 'sheet-1'
    sheetOrder.push(sheetId)
    sheets[sheetId] = sheetJsWorksheetToUniver({}, sheetId, 'Sheet1')
  }

  return {
    id: createWorkbookId(),
    name: fileNameWithoutExtension(fileName) || 'Workbook',
    appVersion: '0.25.1',
    locale: LOCALE_ZH_CN,
    styles: {},
    sheetOrder,
    sheets
  }
}

export function univerWorkbookToSheetJs(snapshot: IWorkbookData): WorkBook {
  const SheetNames: string[] = []
  const Sheets: Record<string, WorkSheet> = {}

  snapshot.sheetOrder.forEach((sheetId, index) => {
    const sheet = snapshot.sheets[sheetId]
    if (!sheet) {
      return
    }

    const sheetName = uniqueSheetName(sheet.name || `Sheet${index + 1}`, SheetNames)
    SheetNames.push(sheetName)
    Sheets[sheetName] = univerWorksheetToSheetJs(sheet, snapshot.styles)
  })

  return { SheetNames, Sheets }
}

function sheetJsWorksheetToUniver(worksheet: WorkSheet, id: string, name: string): IWorksheetData {
  const range = decodeWorksheetRange(worksheet)
  const cellData: IObjectMatrixPrimitiveType<ICellData> = {}
  let maxRow = range?.e.r ?? 0
  let maxColumn = range?.e.c ?? 0

  Object.entries(worksheet).forEach(([address, sourceCell]) => {
    if (address.startsWith('!') || !isSheetJsCell(sourceCell)) {
      return
    }

    const position = decodeCellAddress(address)
    if (!position) {
      return
    }

    const cell = sheetJsCellToUniver(sourceCell)
    if (!cell) {
      return
    }

    cellData[position.row] ??= {}
    cellData[position.row][position.column] = cell
    maxRow = Math.max(maxRow, position.row)
    maxColumn = Math.max(maxColumn, position.column)
  })

  const columnData = toUniverColumnData(worksheet['!cols'])
  const rowData = toUniverRowData(worksheet['!rows'])

  return {
    id,
    name,
    tabColor: '',
    hidden: BOOLEAN_FALSE,
    freeze: {
      xSplit: 0,
      ySplit: 0,
      startRow: 0,
      startColumn: 0
    },
    rowCount: Math.max(DEFAULT_ROW_COUNT, maxRow + 1, Object.keys(rowData).length),
    columnCount: Math.max(DEFAULT_COLUMN_COUNT, maxColumn + 1, Object.keys(columnData).length),
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: 88,
    defaultRowHeight: 24,
    mergeData: (worksheet['!merges'] ?? []).map((merge) => ({
      startRow: merge.s.r,
      startColumn: merge.s.c,
      endRow: merge.e.r,
      endColumn: merge.e.c
    })),
    cellData,
    rowData,
    columnData,
    rowHeader: { width: 46 },
    columnHeader: { height: 24 },
    showGridlines: BOOLEAN_TRUE,
    rightToLeft: BOOLEAN_FALSE
  }
}

function univerWorksheetToSheetJs(
  worksheet: Partial<IWorksheetData>,
  workbookStyles: IWorkbookData['styles']
): WorkSheet {
  const output: WorkSheet = {}
  let maxRow = 0
  let maxColumn = 0

  Object.entries(worksheet.cellData ?? {}).forEach(([rowIndex, row]) => {
    if (!row) {
      return
    }

    Object.entries(row).forEach(([columnIndex, sourceCell]) => {
      if (!sourceCell) {
        return
      }

      const rowNumber = Number(rowIndex)
      const columnNumber = Number(columnIndex)
      if (!Number.isInteger(rowNumber) || !Number.isInteger(columnNumber)) {
        return
      }

      const cell = univerCellToSheetJs(sourceCell, workbookStyles)
      if (!cell) {
        return
      }

      output[encodeCellAddress(rowNumber, columnNumber)] = cell
      maxRow = Math.max(maxRow, rowNumber)
      maxColumn = Math.max(maxColumn, columnNumber)
    })
  })

  const merges = (worksheet.mergeData ?? []).map((merge) => ({
    s: { r: merge.startRow, c: merge.startColumn },
    e: { r: merge.endRow, c: merge.endColumn }
  }))
  if (merges.length) {
    output['!merges'] = merges
    merges.forEach((merge) => {
      maxRow = Math.max(maxRow, merge.e.r)
      maxColumn = Math.max(maxColumn, merge.e.c)
    })
  }

  const columns = toSheetJsColumnData(worksheet.columnData)
  if (columns.length) {
    output['!cols'] = columns
  }

  const rows = toSheetJsRowData(worksheet.rowData)
  if (rows.length) {
    output['!rows'] = rows
  }

  output['!ref'] = `${encodeCellAddress(0, 0)}:${encodeCellAddress(maxRow, maxColumn)}`
  return output
}

function sheetJsCellToUniver(cell: CellObject): ICellData | null {
  const value = normalizeSheetJsCellValue(cell.v, cell.w)
  const formula = cell.f ? `=${cell.f.replace(/^=/, '')}` : undefined
  const style = cell.z ? ({ n: { pattern: String(cell.z) } } satisfies IStyleData) : undefined

  if (value == null && !formula && !style) {
    return null
  }

  return {
    ...(value == null ? {} : { v: value, t: univerCellValueType(value) }),
    ...(formula ? { f: formula } : {}),
    ...(style ? { s: style } : {})
  }
}

function univerCellToSheetJs(cell: ICellData, workbookStyles: IWorkbookData['styles']): CellObject | null {
  const value = normalizeUniverCellValue(cell.v)
  const formula = typeof cell.f === 'string' ? cell.f.replace(/^=/, '') : undefined
  const style = typeof cell.s === 'string' ? workbookStyles[cell.s] : cell.s
  const numberFormat =
    style && typeof style === 'object' && style.n && typeof style.n === 'object' ? style.n.pattern : null

  if (value == null && !formula) {
    return null
  }

  const output: CellObject = {
    t: sheetJsCellValueType(value),
    v: value ?? ''
  }

  if (formula) {
    output.f = formula
  }
  if (numberFormat) {
    output.z = numberFormat
  }

  return output
}

function normalizeSheetJsCellValue(value: unknown, formattedValue?: string) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value == null && formattedValue) {
    return formattedValue
  }
  return value == null ? null : String(value)
}

function normalizeUniverCellValue(value: ICellData['v']): string | number | boolean | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null
}

function univerCellValueType(value: string | number | boolean) {
  if (typeof value === 'number') {
    return CELL_VALUE_TYPE_NUMBER
  }
  if (typeof value === 'boolean') {
    return CELL_VALUE_TYPE_BOOLEAN
  }
  return CELL_VALUE_TYPE_STRING
}

function sheetJsCellValueType(value: ICellData['v']): CellObject['t'] {
  if (typeof value === 'number') {
    return 'n'
  }
  if (typeof value === 'boolean') {
    return 'b'
  }
  return 's'
}

function toUniverColumnData(columns?: ColInfo[]): IObjectMatrixPrimitiveType<IColumnData>[number] {
  return (columns ?? []).reduce<Record<number, Partial<IColumnData>>>((result, column, index) => {
    const width = column.wpx ?? (column.wch ? Math.round(column.wch * 8) : undefined)
    if (width || column.hidden) {
      result[index] = {
        ...(width ? { w: width } : {}),
        ...(column.hidden ? { hd: BOOLEAN_TRUE } : {})
      }
    }
    return result
  }, {})
}

function toUniverRowData(rows?: RowInfo[]): IObjectMatrixPrimitiveType<IRowData>[number] {
  return (rows ?? []).reduce<Record<number, Partial<IRowData>>>((result, row, index) => {
    const height = row.hpx ?? (row.hpt ? Math.round((row.hpt * 96) / 72) : undefined)
    if (height || row.hidden) {
      result[index] = {
        ...(height ? { h: height } : {}),
        ...(row.hidden ? { hd: BOOLEAN_TRUE } : {})
      }
    }
    return result
  }, {})
}

function toSheetJsColumnData(columnData?: IWorksheetData['columnData']): ColInfo[] {
  const columns: ColInfo[] = []
  Object.entries(columnData ?? {}).forEach(([index, column]) => {
    if (!column) {
      return
    }
    columns[Number(index)] = {
      ...(column.w ? { wpx: column.w } : {}),
      ...(column.hd === BOOLEAN_TRUE ? { hidden: true } : {})
    }
  })
  return columns
}

function toSheetJsRowData(rowData?: IWorksheetData['rowData']): RowInfo[] {
  const rows: RowInfo[] = []
  Object.entries(rowData ?? {}).forEach(([index, row]) => {
    if (!row) {
      return
    }
    rows[Number(index)] = {
      ...(row.h ? { hpx: row.h } : {}),
      ...(row.hd === BOOLEAN_TRUE ? { hidden: true } : {})
    }
  })
  return rows
}

function decodeWorksheetRange(worksheet: WorkSheet) {
  const range = worksheet['!ref']
  if (!range) {
    return null
  }

  const [start, end] = range.split(':')
  const startPosition = decodeCellAddress(start)
  const endPosition = decodeCellAddress(end ?? start)
  if (!startPosition || !endPosition) {
    return null
  }

  return {
    s: { r: startPosition.row, c: startPosition.column },
    e: { r: endPosition.row, c: endPosition.column }
  }
}

function decodeCellAddress(address: string) {
  const match = /^([A-Z]+)([1-9][0-9]*)$/i.exec(address)
  if (!match) {
    return null
  }

  const column = match[1]
    .toUpperCase()
    .split('')
    .reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0)

  return { row: Number(match[2]) - 1, column: column - 1 }
}

function encodeCellAddress(row: number, column: number) {
  let columnName = ''
  let remaining = Math.max(0, column) + 1
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26
    columnName = String.fromCharCode(65 + remainder) + columnName
    remaining = Math.floor((remaining - 1) / 26)
  }
  return `${columnName}${Math.max(0, row) + 1}`
}

function isSheetJsCell(value: unknown): value is CellObject {
  return !!value && typeof value === 'object' && ('v' in value || 'f' in value || 'z' in value)
}

function spreadsheetEditorExtension(fileName: string): SpreadsheetEditorExtension {
  const extension = fileExtension(fileName)
  if (SPREADSHEET_EDITOR_EXTENSIONS.includes(extension as SpreadsheetEditorExtension)) {
    return extension as SpreadsheetEditorExtension
  }
  return 'xlsx'
}

function spreadsheetMimeType(extension: SpreadsheetEditorExtension) {
  if (extension === 'csv') {
    return 'text/csv;charset=utf-8'
  }
  if (extension === 'xls') {
    return 'application/vnd.ms-excel'
  }
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

function fileExtension(filePath: string | null | undefined) {
  const fileName = filePath?.split('/').pop() ?? ''
  return fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''
}

function fileNameWithoutExtension(fileName: string) {
  const normalized = fileName.split('/').pop() ?? fileName
  const extensionIndex = normalized.lastIndexOf('.')
  return extensionIndex > 0 ? normalized.slice(0, extensionIndex) : normalized
}

function uniqueSheetName(sheetName: string, existingNames: string[]) {
  const normalized = sheetName.slice(0, 31) || 'Sheet'
  if (!existingNames.includes(normalized)) {
    return normalized
  }

  let suffix = 2
  while (existingNames.includes(`${normalized.slice(0, 28)}-${suffix}`)) {
    suffix++
  }
  return `${normalized.slice(0, 28)}-${suffix}`
}

function createWorkbookId() {
  return `workspace-sheet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function readBlobArrayBuffer(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read spreadsheet file'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read spreadsheet file'))
    reader.readAsArrayBuffer(blob)
  })
}

async function readBlobText(blob: Blob) {
  if (typeof blob.text === 'function') {
    return blob.text()
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read CSV file'))
    reader.readAsText(blob)
  })
}

function toBlobParts(output: unknown): BlobPart[] {
  if (output instanceof ArrayBuffer || typeof output === 'string') {
    return [output]
  }
  if (output instanceof Uint8Array) {
    const copy = new Uint8Array(output.byteLength)
    copy.set(output)
    return [copy.buffer]
  }
  if (ArrayBuffer.isView(output)) {
    const copy = new Uint8Array(output.byteLength)
    copy.set(new Uint8Array(output.buffer, output.byteOffset, output.byteLength))
    return [copy.buffer]
  }
  throw new Error('Failed to export spreadsheet data')
}
