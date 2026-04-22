import {
  loadDocumentPreview,
  loadSpreadsheetPreview,
  resolveFilePreviewKind,
  toFilePreviewSource
} from './file-preview.utils'

jest.mock('mammoth', () => ({
  convertToHtml: jest.fn()
}))

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

  it('loads docx rich preview html from the browser preview url', async () => {
    const { convertToHtml } = await import('mammoth')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(16))
    } as Response)
    ;(convertToHtml as jest.Mock).mockResolvedValue({
      value: '<h1>Executive summary</h1><p>Next steps</p>'
    })

    await expect(loadDocumentPreview('/api/files/proposal.docx')).resolves.toContain('Executive summary')
    expect(global.fetch).toHaveBeenCalledWith('/api/files/proposal.docx')
    expect(convertToHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        arrayBuffer: expect.any(ArrayBuffer)
      }),
      expect.objectContaining({
        idPrefix: 'xp-docx-',
        ignoreEmptyParagraphs: false
      })
    )
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
