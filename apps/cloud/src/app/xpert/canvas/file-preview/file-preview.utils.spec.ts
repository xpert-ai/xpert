import { readExcelWorkSheets } from '@xpert-ai/core'
import {
  loadCanvasSpreadsheetPreview,
  resolveCanvasFilePreviewKind,
  toCanvasFilePreviewSource
} from './file-preview.utils'

jest.mock('@xpert-ai/core', () => ({
  readExcelWorkSheets: jest.fn()
}))

describe('file preview utils', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('prefers explicit mime types for binary previews', () => {
    expect(
      resolveCanvasFilePreviewKind(
        toCanvasFilePreviewSource({
          mimeType: 'image/png',
          name: 'notes.txt'
        })
      )
    ).toBe('image')
  })

  it('refines generic text mime types with the file extension', () => {
    expect(
      resolveCanvasFilePreviewKind(
        toCanvasFilePreviewSource({
          mimeType: 'text/plain',
          name: 'main.py'
        })
      )
    ).toBe('code')
  })

  it('falls back to spreadsheet extensions when mime metadata is missing', () => {
    expect(
      resolveCanvasFilePreviewKind(
        toCanvasFilePreviewSource({
          name: 'report.xlsx'
        })
      )
    ).toBe('spreadsheet')
  })

  it('returns unsupported for unknown file types', () => {
    expect(
      resolveCanvasFilePreviewKind(
        toCanvasFilePreviewSource({
          mimeType: 'application/octet-stream',
          name: 'archive.bin'
        })
      )
    ).toBe('unsupported')
  })

  it('loads spreadsheet previews and truncates each sheet to the preview row limit', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      Amount: index + 1
    }))
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['spreadsheet'], { type: 'application/vnd.ms-excel' })
    })
    global.fetch = fetchMock as typeof fetch
    ;(readExcelWorkSheets as jest.Mock).mockResolvedValue([
      {
        columns: [{ name: 'Amount' }],
        data: rows,
        fileName: 'report.xlsx',
        name: 'Summary'
      },
      {
        columns: [{ name: 'City' }],
        data: [{ City: 'Shanghai' }],
        fileName: 'report.xlsx',
        name: 'Cities'
      }
    ])

    const preview = await loadCanvasSpreadsheetPreview(
      '/api/files/report.xlsx',
      'report.xlsx',
      'application/vnd.ms-excel'
    )

    expect(fetchMock).toHaveBeenCalledWith('/api/files/report.xlsx')
    expect(readExcelWorkSheets).toHaveBeenCalledWith(expect.any(File))
    expect(preview.rowLimit).toBe(200)
    expect(preview.sheets[0]).toMatchObject({
      name: 'Summary',
      totalRows: 250
    })
    expect(preview.sheets[0].rows).toHaveLength(200)
    expect(preview.sheets[1].rows).toEqual([{ City: 'Shanghai' }])
  })
})
