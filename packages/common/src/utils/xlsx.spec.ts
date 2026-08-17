import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { loadExcel, loadExcelWorkbook } from './xlsx'

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
})

function writeWorkbook(directory: string) {
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
  const filePath = join(directory, 'sample.xlsx')
  XLSX.writeFile(workbook, filePath)
  return filePath
}
