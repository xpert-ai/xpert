import type { KnowledgeTableColumn } from '@xpert-ai/contracts'
import chardet from 'chardet'
import fsPromises from 'fs/promises'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'

// Spreadsheet column types used by the server-side XLSX helpers.
export declare type TableColumnType = 'String' | 'Integer' | 'Numeric' | 'Boolean' | 'Datetime' | 'Date' | 'Time'
export interface UploadSheetType {
  file: File
  fileName: string
  name: string
  columns: Array<{
    isKey?: boolean
    name: string
    fieldName: string
    type: TableColumnType
  }>
  data: Array<unknown>
  preview: Array<unknown>
  status: 'done' | 'uploading' | 'error'
  info: string
}

export async function readExcelWorkSheets(
  fileName: string,
  file: { buffer?: Buffer; path?: string } /*Express.Multer.File*/
) {
  const workBook: XLSX.WorkBook = file.buffer
    ? XLSX.read(file.buffer, {
        type: 'buffer',
        cellDates: true,
        cellNF: false,
        codepage: 65001
      })
    : XLSX.readFile(file.path, {
        type: 'file',
        cellDates: true,
        cellNF: false
      })

  return await readExcelJson(workBook, fileName)
}

export async function readExcelJson(wSheet, fileName = ''): Promise<UploadSheetType[]> {
  const name = fileName
    .replace(/\.xlsx$/, '')
    .replace(/\.xls$/, '')
    .replace(/\.csv$/, '')

  // AOA : array of array
  type AOA = any[][]

  // const sheetCellRange = XLSX.utils.decode_range(wSheet['!ref'])
  // const sheetMaxRow = sheetCellRange.e.r

  return wSheet.SheetNames.map((sheetName) => {
    const origExcelData = <AOA>XLSX.utils.sheet_to_json(wSheet.Sheets[sheetName], {
      header: 1,
      range: wSheet['!ref'],
      raw: true
    })

    const refExcelData = origExcelData.slice(1).map((value) => Object.assign([], value))
    const excelTransformNum = origExcelData[0].map((col) => `${col}`.trim())

    /* 合併成JSON */
    const excelDataEncodeToJson = refExcelData.slice(0).map((item, row) =>
      item.reduce((obj, val, i) => {
        if (!excelTransformNum[i]) {
          throw new Error(`The column name corresponding to cell in row ${row + 2} and column ${i + 1} was not found. The file is ${fileName}.
The current row data is ${item}, and the header row data is ${excelTransformNum}.`)
        }
        obj[excelTransformNum[i].trim()] = val
        return obj
      }, {})
    )

    const columns = excelTransformNum.map((column, i) => {
      const item = excelDataEncodeToJson.find((item) => typeof item[column] !== 'undefined')
      return {
        name: column,
        fieldName: column,
        type: mapToTableColumnType(item ? typeof item[column] : null)
      }
    })

    return {
      fileName,
      name: wSheet.SheetNames.length > 1 ? sheetName : name,
      columns: columns.filter((col) => !!col),
      data: excelDataEncodeToJson
    }
  })
}

export function mapToTableColumnType(type: string): TableColumnType {
  switch (type) {
    case 'string':
      return 'String'
    case 'number':
      return 'Numeric'
    case 'date':
      return 'Date'
    default:
      return 'String'
  }
}

/**
 * Automatically identify encoding and parse CSV into JSON (adapted to Chinese)
 *
 * @param filePath
 * @returns
 */
export async function loadCsvWithAutoEncoding(filePath: string) {
  // Step 1: Read the original Buffer
  const buffer = await fsPromises.readFile(filePath)

  // Step 2: Automatically detect encoding (may return GB18030, UTF-8, etc.)
  const encoding = chardet.detect(buffer) || 'utf8'

  // Step 3: Decode to string
  const content = iconv.decode(buffer, encoding)

  // Step 4: Parse to Sheet
  const workbook = XLSX.read(content, { type: 'string' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // Step 5: Convert to JSON
  const jsonData = XLSX.utils.sheet_to_json(sheet)

  return jsonData
}

export async function loadExcel(filePath: string, options?: { firstRowAsHeader?: boolean }) {
  const workbook = XLSX.readFile(filePath, {
    type: 'file',
    cellDates: true,
    cellNF: false
  })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  const jsonData = XLSX.utils.sheet_to_json(sheet, options?.firstRowAsHeader === false ? { header: 'A' } : undefined)

  return jsonData
}

export interface LoadedSpreadsheetCell {
  address: string
  row: number
  column: number
  value: string
}

export interface LoadedSpreadsheetSheet {
  index: number
  name: string
  range?: string
  hidden: boolean
  merges: string[]
  cells: LoadedSpreadsheetCell[]
  records: Record<string, unknown>[]
  recordRows: number[]
  headerRow?: number
  columns: KnowledgeTableColumn[]
}

export interface LoadedSpreadsheetWorkbook {
  sheets: LoadedSpreadsheetSheet[]
}

export class SpreadsheetSourceRowError extends Error {
  constructor() {
    super()
    this.name = 'SpreadsheetSourceRowError'
  }
}

/**
 * Loads every worksheet while retaining cell coordinates. This representation is
 * intended for form-like workbooks where values in nearby cells form one document,
 * rather than independent database records.
 */
export async function loadExcelWorkbook(
  filePath: string,
  options?: { firstRowAsHeader?: boolean }
): Promise<LoadedSpreadsheetWorkbook> {
  return loadTableWorkbook(filePath, { format: 'excel', sheetMode: 'all', ...options })
}

/** Preserve the legacy first-sheet/raw-value path independently of header interpretation. */
export async function loadTableWorkbook(
  filePath: string,
  options: { format: 'excel' | 'csv'; sheetMode: 'legacy' | 'all'; firstRowAsHeader?: boolean }
): Promise<LoadedSpreadsheetWorkbook> {
  const workbook =
    options.format === 'csv'
      ? XLSX.read(await decodeCsv(filePath), { type: 'string' })
      : XLSX.readFile(filePath, { type: 'file', cellDates: true, cellNF: false })
  const firstRowAsHeader = options.format === 'csv' || options.firstRowAsHeader !== false
  const names = options.sheetMode === 'legacy' ? workbook.SheetNames.slice(0, 1) : workbook.SheetNames
  const recordOptions: XLSX.Sheet2JSONOpts = {
    ...(options.sheetMode === 'all' ? { defval: null, raw: false } : {}),
    ...(!firstRowAsHeader ? { header: 'A' } : {})
  }

  return {
    sheets: names.map((name, index) => {
      const sheet = workbook.Sheets[name]
      const visibility = workbook.Workbook?.Sheets?.[index]?.Hidden ?? 0
      const cells = Object.entries(sheet)
        .filter(([address]) => !address.startsWith('!'))
        .map(([address, cell]) => {
          const decoded = XLSX.utils.decode_cell(address)
          const typedCell = cell as XLSX.CellObject
          const value = typedCell.w ?? formatSpreadsheetValue(typedCell.v)
          return {
            address,
            row: decoded.r + 1,
            column: decoded.c + 1,
            value
          }
        })
        .filter((cell) => cell.value.trim().length > 0)
        .sort((left, right) => left.row - right.row || left.column - right.column)

      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, recordOptions)
      const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
      return {
        index,
        name,
        range: sheet['!ref'],
        hidden: visibility !== 0,
        merges: (sheet['!merges'] ?? []).map((merge) => XLSX.utils.encode_range(merge)),
        cells,
        records,
        recordRows: records.map((record) => {
          const row: unknown = Object.getOwnPropertyDescriptor(record, '__rowNum__')?.value
          if (typeof row !== 'number') throw new SpreadsheetSourceRowError()
          return row + 1
        }),
        ...(firstRowAsHeader && range ? { headerRow: range.s.r + 1 } : {}),
        columns: spreadsheetColumns(sheet, firstRowAsHeader).map((column) => {
          // Inspect native cells, before raw:false converts booleans to display strings.
          const cells = records
            .map((record) => {
              const row: unknown = Object.getOwnPropertyDescriptor(record, '__rowNum__')?.value
              if (typeof row !== 'number') throw new SpreadsheetSourceRowError()
              return sheet[XLSX.utils.encode_cell({ r: row, c: column.column - 1 })] as XLSX.CellObject | undefined
            })
            .filter((cell) => cell && cell.v != null && cell.t !== 'z')
          return {
            ...column,
            ...(cells.length && cells.every((cell) => cell.t === 'b') ? { valueType: 'boolean' as const } : {})
          }
        })
      }
    })
  }
}

async function decodeCsv(filePath: string) {
  const buffer = await fsPromises.readFile(filePath)
  return iconv.decode(buffer, chardet.detect(buffer) || 'utf8')
}

/** Use the parser's header mapping even for header-only sheets and numeric/duplicate column labels. */
function spreadsheetColumns(sheet: XLSX.WorkSheet, firstRowAsHeader: boolean): LoadedSpreadsheetSheet['columns'] {
  if (!sheet['!ref']) return []
  const range = XLSX.utils.decode_range(sheet['!ref'])
  const headerSheet: XLSX.WorkSheet = {}
  const dataRow = range.s.r + (firstRowAsHeader ? 1 : 0)
  headerSheet['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: dataRow, c: range.e.c } })
  for (let column = range.s.c; column <= range.e.c; column++) {
    const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: column })
    if (firstRowAsHeader && sheet[headerAddress]) headerSheet[headerAddress] = sheet[headerAddress]
    headerSheet[XLSX.utils.encode_cell({ r: dataRow, c: column })] = { t: 'n', v: column + 1 }
  }
  const row = XLSX.utils.sheet_to_json<Record<string, unknown>>(headerSheet, firstRowAsHeader ? {} : { header: 'A' })[0]
  return Object.entries(row ?? {})
    .flatMap(([key, column]) =>
      typeof column === 'number' ? [{ columnId: XLSX.utils.encode_col(column - 1), key, label: key, column }] : []
    )
    .sort((left, right) => left.column - right.column)
}

function formatSpreadsheetValue(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
