import {
  exportSpreadsheetFile,
  importSpreadsheetFile,
  isSpreadsheetEditorFile,
  univerWorkbookToSheetJs
} from './spreadsheet-file.utils'

describe('spreadsheet file utils', () => {
  it('recognizes workspace spreadsheet formats', () => {
    expect(isSpreadsheetEditorFile('reports/budget.xlsx')).toBe(true)
    expect(isSpreadsheetEditorFile('legacy.xls')).toBe(true)
    expect(isSpreadsheetEditorFile('data.csv')).toBe(true)
    expect(isSpreadsheetEditorFile('notes.md')).toBe(false)
  })

  it('imports xlsx cells, formulas, number formats, merges, and dimensions into Univer', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Item', 'Amount'],
      ['Consulting', 1250]
    ])
    worksheet.B2.f = 'SUM(B2:B2)'
    worksheet.B2.z = '#,##0.00'
    worksheet['!merges'] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }]
    worksheet['!cols'] = [{ wpx: 180 }, { wpx: 110 }]
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Budget')
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true })

    const snapshot = await importSpreadsheetFile(
      new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'budget.xlsx'
    )
    const sheet = snapshot.sheets[snapshot.sheetOrder[0]]

    expect(sheet?.name).toBe('Budget')
    expect(sheet?.cellData?.[0]?.[0]?.v).toBe('Item')
    expect(sheet?.cellData?.[1]?.[1]?.f).toBe('=SUM(B2:B2)')
    expect(sheet?.mergeData).toEqual([{ startRow: 2, startColumn: 0, endRow: 2, endColumn: 1 }])
    expect(sheet?.columnData?.[0]?.w).toBeGreaterThan(0)
  })

  it('exports edited Univer snapshots back to xlsx', async () => {
    const XLSX = await import('xlsx')
    const source = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'Total'],
        ['A', 10]
      ]),
      'Sheet1'
    )
    const sourceData = XLSX.write(source, { type: 'array', bookType: 'xlsx' })
    const snapshot = await importSpreadsheetFile(new Blob([sourceData]), 'report.xlsx')
    const sheet = snapshot.sheets[snapshot.sheetOrder[0]]
    if (!sheet?.cellData?.[1]) {
      throw new Error('Expected imported worksheet data')
    }
    sheet.cellData[1][1] = { v: 25, f: '=SUM(B2:B2)' }

    const file = await exportSpreadsheetFile(snapshot, 'report.xlsx')
    const exported = XLSX.read(await readBlobArrayBuffer(file), { type: 'array', cellFormula: true })

    expect(file.name).toBe('report.xlsx')
    expect(exported.Sheets.Sheet1.B2.v).toBe(25)
    expect(exported.Sheets.Sheet1.B2.f).toBe('SUM(B2:B2)')
  })

  it('round-trips a single-sheet csv file and rejects lossy multi-sheet csv saves', async () => {
    const snapshot = await importSpreadsheetFile(new Blob(['name,amount\nAlpha,12']), 'data.csv')
    const file = await exportSpreadsheetFile(snapshot, 'data.csv')

    expect(await readBlobText(file)).toContain('Alpha,12')

    const firstSheet = snapshot.sheets[snapshot.sheetOrder[0]]
    snapshot.sheetOrder.push('sheet-2')
    snapshot.sheets['sheet-2'] = { ...firstSheet, id: 'sheet-2', name: 'Extra' }

    await expect(exportSpreadsheetFile(snapshot, 'data.csv')).rejects.toThrow('CSV files can only store one worksheet')
  })

  it('converts Univer data to a valid SheetJS workbook without exporting a file', async () => {
    const snapshot = await importSpreadsheetFile(new Blob(['value\n42']), 'data.csv')
    const workbook = univerWorkbookToSheetJs(snapshot)

    expect(workbook.SheetNames).toEqual(['Sheet1'])
    expect(workbook.Sheets.Sheet1.A2.v).toBe(42)
  })
})

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

function readBlobArrayBuffer(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error('Expected an ArrayBuffer'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}
