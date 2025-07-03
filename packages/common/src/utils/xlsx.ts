import chardet from 'chardet'
import fsPromises from 'fs/promises'
import iconv from 'iconv-lite'
import * as XLSX from 'xlsx'

// The same as import { TableColumnType } from '@metad/ocap-core'
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

export async function loadExcel(filePath: string) {
  const workbook = XLSX.readFile(filePath, {
        type: 'file',
        cellDates: true,
        cellNF: false
      })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  const jsonData = XLSX.utils.sheet_to_json(sheet)

  return jsonData
}