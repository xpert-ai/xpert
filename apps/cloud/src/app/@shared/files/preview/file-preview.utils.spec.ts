import {
  loadDocumentPreview,
  loadSpreadsheetPreview,
  resolveFilePreviewKind,
  toFilePreviewSource
} from './file-preview.utils'

describe('shared file preview utils', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('recognizes docx files by extension', () => {
    expect(
      resolveFilePreviewKind(
        toFilePreviewSource({
          name: 'proposal.docx'
        })
      )
    ).toBe('document')
  })

  it('recognizes pptx files by mime type', () => {
    expect(
      resolveFilePreviewKind(
        toFilePreviewSource({
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          name: 'deck.bin'
        })
      )
    ).toBe('presentation')
  })

  it('keeps xlsx files on the spreadsheet preview path', () => {
    expect(
      resolveFilePreviewKind(
        toFilePreviewSource({
          name: 'report.xlsx'
        })
      )
    ).toBe('spreadsheet')
  })

  it('loads docx preview blobs from the browser preview url', async () => {
    const blob = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(blob)
    } as Response)

    await expect(loadDocumentPreview('/api/files/proposal.docx')).resolves.toBe(blob)
    expect(global.fetch).toHaveBeenCalledWith('/api/files/proposal.docx')
  })

  it('loads xlsx previews as a raw spreadsheet grid so template files remain previewable', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([['发票开具项目信息导入模板'], ['项目名称', '金额'], ['咨询服务', 100]])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template')
    const workbookData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue({
        arrayBuffer: jest.fn().mockResolvedValue(workbookData),
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      } satisfies Pick<Blob, 'arrayBuffer' | 'type'>)
    } as Response)

    const preview = await loadSpreadsheetPreview(
      '/api/files/template.xlsx',
      'template.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

    expect(global.fetch).toHaveBeenCalledWith('/api/files/template.xlsx')
    expect(preview.sheets[0]?.columns.map((column) => column.name)).toEqual(['A', 'B'])
    expect(preview.sheets[0]?.rows[0]).toMatchObject({
      A: '发票开具项目信息导入模板',
      B: ''
    })
    expect(preview.sheets[0]?.rows[1]).toMatchObject({
      A: '项目名称',
      B: '金额'
    })
  })
})
