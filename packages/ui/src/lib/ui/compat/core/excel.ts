import type { WorkBook } from 'xlsx'

export interface ExcelPreviewColumn {
  name: string
  fieldName: string
}

export interface ExcelPreviewSheet {
  fileName: string
  name: string
  columns: ExcelPreviewColumn[]
  data: Record<string, unknown>[]
}

export async function readExcelWorkSheets(file: File): Promise<ExcelPreviewSheet[]> {
  const XLSX = await import('xlsx')

  return new Promise<ExcelPreviewSheet[]>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`))

    if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
      reader.onload = async (event) => {
        const result = event.target?.result
        if (typeof result !== 'string') {
          reject(new Error('Failed to read CSV file as UTF-8 text.'))
          return
        }

        try {
          const text = result.charCodeAt(0) === 0xfeff ? result.slice(1) : result
          const workbook = XLSX.read(text, { type: 'string', codepage: 65001 })
          resolve(await readExcelJson(workbook, file.name))
        } catch (error) {
          reject(error)
        }
      }
      reader.readAsText(file, 'UTF-8')
      return
    }

    reader.onload = async (event) => {
      const result = event.target?.result
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read Excel file as binary data.'))
        return
      }

      try {
        const workbook = XLSX.read(result, {
          type: 'array',
          codepage: 65001,
          cellDates: true,
          cellNF: false
        })
        resolve(await readExcelJson(workbook, file.name))
      } catch (error) {
        reject(error)
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

async function readExcelJson(workbook: WorkBook, fileName: string): Promise<ExcelPreviewSheet[]> {
  const XLSX = await import('xlsx')
  const baseName = fileName.replace(/\.(xlsx|xls|csv)$/i, '')

  return workbook.SheetNames.map((sheetName) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: true
    })
    const columns = (rows[0] ?? []).map((value) => `${value ?? ''}`.trim())
    const data = rows.slice(1).map((row, rowIndex) => {
      const record: Record<string, unknown> = {}
      row.forEach((value, columnIndex) => {
        const column = columns[columnIndex]
        if (!column) {
          throw new Error(`No column name found for cell at row ${rowIndex + 2}, column ${columnIndex + 1}`)
        }
        record[column] = value
      })
      return record
    })

    return {
      fileName,
      name: workbook.SheetNames.length > 1 ? sheetName : baseName,
      columns: columns.filter(Boolean).map((name) => ({ name, fieldName: name })),
      data
    }
  })
}
