import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import iconv from 'iconv-lite'
import { loadExcel, loadExcelWorkbook, loadTableWorkbook } from './xlsx'

describe('XLSX helpers', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xpert-xlsx-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('retains the legacy first-sheet record behavior', async () => {
    const filePath = writeWorkbook(directory)
    await expect(loadExcel(filePath)).resolves.toEqual([{ Label: 'Voltage', Value: '400 V' }])
  })

  it.each(['xls', 'xlsx'])('retains the first row as data with coordinate keys in %s', async (extension) => {
    const filePath = writeWorkbook(directory, extension)
    await expect(loadExcel(filePath, { firstRowAsHeader: false })).resolves.toEqual([
      { A: 'Label', B: 'Value' },
      { A: 'Voltage', B: '400 V' }
    ])
  })

  it('keeps native boolean types even when record display values are formatted strings', async () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Flag', 'Mixed'],
        [true, true],
        [false, 'TRUE']
      ]),
      'Flags'
    )
    const path = join(directory, 'flags.xlsx')
    XLSX.writeFile(book, path)
    const result = await loadExcelWorkbook(path)
    expect(result.sheets[0].records[0].Flag).toBe('TRUE')
    expect(result.sheets[0].columns[0]).toMatchObject({ valueType: 'boolean' })
    expect(result.sheets[0].columns[1]).not.toHaveProperty('valueType')
  })

  it('loads all sheets with cell anchors, ranges, merges, and visibility', async () => {
    const filePath = writeWorkbook(directory)
    const workbook = await loadExcelWorkbook(filePath)

    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual(['Cover', 'Requirements'])
    expect(workbook.sheets[0]).toMatchObject({ range: 'A1:B2', hidden: false, merges: [] })
    expect(workbook.sheets[0].cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ address: 'A2', row: 2, column: 1, value: 'Voltage' }),
        expect.objectContaining({ address: 'B2', row: 2, column: 2, value: '400 V' })
      ])
    )
    expect(workbook.sheets[1]).toMatchObject({ hidden: true, merges: ['A1:B1'] })
  })

  it('describes actual column coordinates, duplicate headers and sparse source rows', async () => {
    const workbook = XLSX.utils.book_new()
    const sheet: XLSX.WorkSheet = {}
    XLSX.utils.sheet_add_aoa(sheet, [['Name', 'Name', null], ['Alice', 'A', 0], [], ['Bob', 'B', false]], {
      origin: 'C3'
    })
    sheet['!ref'] = 'C3:E6'
    XLSX.utils.book_append_sheet(workbook, sheet, 'People')
    const filePath = join(directory, 'people.xlsx')
    XLSX.writeFile(workbook, filePath)

    const result = await loadTableWorkbook(filePath, { format: 'excel', sheetMode: 'legacy' })
    expect(result.sheets[0]).toMatchObject({
      index: 0,
      headerRow: 3,
      range: 'C3:E6',
      columns: [
        { columnId: 'C', column: 3, key: 'Name', label: 'Name' },
        { columnId: 'D', column: 4, key: 'Name_1', label: 'Name_1' },
        { columnId: 'E', column: 5, key: '__EMPTY', label: '__EMPTY' }
      ],
      recordRows: [4, 6],
      records: [
        { Name: 'Alice', Name_1: 'A', __EMPTY: 0 },
        { Name: 'Bob', Name_1: 'B', __EMPTY: false }
      ]
    })
  })

  it('keeps CSV header semantics even when the Excel header preference is false', async () => {
    const filePath = join(directory, 'table.csv')
    await writeFile(filePath, 'Name,Count\nAlice,0\nBob,2\n')
    const result = await loadTableWorkbook(filePath, { format: 'csv', sheetMode: 'legacy', firstRowAsHeader: false })
    expect(result.sheets[0]).toMatchObject({
      headerRow: 1,
      recordRows: [2, 3],
      records: [
        { Name: 'Alice', Count: 0 },
        { Name: 'Bob', Count: 2 }
      ]
    })
  })

  it.each(['utf8', 'gb18030'])('preserves Chinese CSV headers and values encoded as %s', async (encoding) => {
    const filePath = join(directory, 'chinese.csv')
    const text =
      '地区,产品名称,数量\n华东地区,工业温度传感器,12\n华南地区,电力监控设备,25\n华北地区,自动化控制系统,36\n'
    await writeFile(filePath, iconv.encode(text, encoding))
    const result = await loadTableWorkbook(filePath, { format: 'csv', sheetMode: 'legacy', firstRowAsHeader: false })
    expect(result.sheets[0].records[0]).toEqual({ 地区: '华东地区', 产品名称: '工业温度传感器', 数量: 12 })
    expect(result.sheets[0].recordRows).toEqual([2, 3, 4])
  })

  it('retains a header-only worksheet schema and sorts numeric headers by source column', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['10', '2', '10']]), 'Schema')
    const filePath = join(directory, 'schema.xlsx')
    XLSX.writeFile(workbook, filePath)
    const result = await loadTableWorkbook(filePath, { format: 'excel', sheetMode: 'all' })
    expect(result.sheets[0]).toMatchObject({
      records: [],
      recordRows: [],
      headerRow: 1,
      columns: [
        { columnId: 'A', column: 1, key: '10', label: '10' },
        { columnId: 'B', column: 2, key: '2', label: '2' },
        { columnId: 'C', column: 3, key: '10_1', label: '10_1' }
      ]
    })
  })
})

function writeWorkbook(directory: string, extension = 'xlsx') {
  const workbook = XLSX.utils.book_new()
  const cover = XLSX.utils.aoa_to_sheet([
    ['Label', 'Value'],
    ['Voltage', '400 V']
  ])
  XLSX.utils.book_append_sheet(workbook, cover, 'Cover')
  const requirements = XLSX.utils.aoa_to_sheet([['Technical inquiry'], ['Protection', 'IP55']])
  requirements['!merges'] = [XLSX.utils.decode_range('A1:B1')]
  XLSX.utils.book_append_sheet(workbook, requirements, 'Requirements')
  if (!workbook.Workbook) workbook.Workbook = {}
  workbook.Workbook.Sheets = [{ Hidden: 0 }, { Hidden: 1 }]
  const filePath = join(directory, `sample.${extension}`)
  XLSX.writeFile(workbook, filePath)
  return filePath
}
