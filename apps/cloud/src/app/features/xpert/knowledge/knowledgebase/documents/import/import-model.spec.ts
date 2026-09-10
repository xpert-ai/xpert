import { KBDocumentCategoryEnum, KDocumentSourceType } from '@xpert-ai/contracts'
import { buildImportDocuments, quickWebOptions, remoteSourceDocuments } from './import-model'

describe('document import payloads', () => {
  it('isolates batch settings and location while preserving source identity', () => {
    const config = { chunkSize: 512, imageUnderstandingEnabled: false }
    const input = [
      {
        id: 'temporary',
        name: 'report',
        sourceType: KDocumentSourceType.WebCrawl,
        metadata: { url: 'https://example.com' }
      }
    ]
    const docs = buildImportDocuments(input, config, 'kb', 'folder')
    expect(docs[0]).toMatchObject({
      knowledgebaseId: 'kb',
      parent: { id: 'folder' },
      sourceType: KDocumentSourceType.WebCrawl,
      parserConfig: config
    })
    expect(docs[0].id).toBeUndefined()
    docs[0].parserConfig.chunkSize = 900
    expect(config.chunkSize).toBe(512)
    expect(input[0].id).toBe('temporary')
  })
  it('preserves per-file spreadsheet settings in a mixed batch', () => {
    const docs = buildImportDocuments(
      [
        { name: 'sheet', category: KBDocumentCategoryEnum.Sheet, parserConfig: { indexedFields: ['name'] } },
        { name: 'text', category: KBDocumentCategoryEnum.Text }
      ],
      { chunkSize: 512 },
      'kb',
      null
    )
    expect(docs[0].parserConfig).toEqual({ indexedFields: ['name'] })
    expect(docs[1].parserConfig).toEqual({ chunkSize: 512 })
    expect(docs[1].parent).toBeNull()
  })
  it('applies the PDF parser only to PDFs and preserves a mixed spreadsheet configuration', () => {
    const visionModel = { model: 'vision' }
    const docs = buildImportDocuments(
      [
        { type: '.PDF', category: KBDocumentCategoryEnum.Text },
        { type: 'txt', category: KBDocumentCategoryEnum.Text },
        { type: 'xlsx', category: KBDocumentCategoryEnum.Sheet, parserConfig: { indexedFields: ['sku'] } }
      ],
      { chunkSize: 800, imageUnderstandingEnabled: true, imageUnderstanding: { promptTemplate: 'Read {{context}}' } },
      'kb',
      null,
      { pdfParser: { transformerType: 'pdf-visual', transformer: { maxPages: 10 } }, visionModel }
    )
    expect(docs[0].parserConfig).toMatchObject({
      transformerType: 'pdf-visual',
      transformer: { maxPages: 10 },
      imageUnderstandingModel: visionModel,
      imageUnderstanding: { promptTemplate: 'Read {{context}}' }
    })
    expect(docs[1].parserConfig.transformerType).toBeUndefined()
    expect(docs[1].parserConfig.chunkSize).toBe(800)
    expect(docs[2].parserConfig).toEqual({ indexedFields: ['sku'] })
  })
  it('uses the existing single-page crawl mode for quick URLs', () => {
    expect(quickWebOptions(' https://example.com/a ')).toEqual({
      url: 'https://example.com/a',
      params: { mode: 'scrape' }
    })
  })
  it('applies batch spreadsheet settings to a sheet-only import', () => {
    const docs = buildImportDocuments(
      [{ category: KBDocumentCategoryEnum.Sheet }],
      { indexedFields: ['sku'] },
      'kb',
      null
    )
    expect(docs[0].parserConfig).toEqual({ indexedFields: ['sku'] })
  })
  it('turns remote text results into document pages, never file uploaders', () => {
    const docs = remoteSourceDocuments([{ pageContent: 'Hello', metadata: { source: '/data/a.txt' } }])
    expect(docs[0]).toMatchObject({
      sourceType: KDocumentSourceType.FileSystem,
      name: '/data/a.txt',
      pages: [{ pageContent: 'Hello' }]
    })
    expect(() => remoteSourceDocuments([{ title: 'invalid' }])).toThrow()
  })
})
