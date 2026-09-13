import { KBDocumentCategoryEnum, KDocumentSourceType } from '@xpert-ai/contracts'
import { buildImportDocuments, quickWebOptions, remoteSourceDocuments } from './import-model'

describe('document import payloads', () => {
  it('isolates batch settings and location while preserving source identity', () => {
    const config = { chunkSize: 512, maxChunkTokens: 128, imageUnderstandingEnabled: false }
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
    expect(docs[0].parserConfig).toEqual({
      indexedFields: ['name'],
      chunkSize: 512,
      spreadsheet: { interpretation: 'records', includeSheets: ['*'] }
    })
    expect(docs[1].parserConfig).toEqual({ chunkSize: 512 })
    expect(docs[1].parent).toBeNull()
  })
  it('preserves question generation across text and sheet documents in the same batch', () => {
    const questionGeneration = { enabled: false, questionCount: 3 }
    const docs = buildImportDocuments(
      [
        { type: 'txt', category: KBDocumentCategoryEnum.Text },
        { type: 'xlsx', category: KBDocumentCategoryEnum.Sheet, parserConfig: { indexedFields: ['name'] } }
      ],
      { questionGeneration },
      'kb',
      null
    )
    expect(docs.every((doc) => doc.parserConfig.questionGeneration.enabled === false)).toBe(true)
    expect(docs[1].parserConfig.indexedFields).toEqual(['name'])
    docs[1].parserConfig.questionGeneration.questionCount = 5
    expect(questionGeneration.questionCount).toBe(3)
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
    expect(docs[2].parserConfig).toEqual({
      indexedFields: ['sku'],
      chunkSize: 800,
      spreadsheet: { interpretation: 'records', includeSheets: ['*'] }
    })
  })
  it('applies shared chunk settings to mixed batches without replacing spreadsheet conversion settings', () => {
    const sheetConfig = {
      indexedFields: ['sku'],
      spreadsheet: { includeSheets: ['Orders'] },
      transformerType: 'sheet-transformer',
      imageUnderstandingEnabled: false,
      textSplitterType: 'recursive-character',
      textSplitter: { chunkSize: 1000 }
    }
    const docs = buildImportDocuments(
      [
        { category: KBDocumentCategoryEnum.Sheet, parserConfig: sheetConfig },
        { category: KBDocumentCategoryEnum.Text }
      ],
      { textSplitterType: 'auto', textSplitter: { chunkSize: 800, chunkOverlap: 40 }, maxChunkTokens: 256 },
      'kb',
      null
    )
    expect(docs[0].parserConfig).toEqual({
      ...sheetConfig,
      spreadsheet: { ...sheetConfig.spreadsheet, interpretation: 'records' },
      textSplitterType: 'auto',
      textSplitter: { chunkSize: 800, chunkOverlap: 40 },
      maxChunkTokens: 256
    })
    docs[0].parserConfig.spreadsheet.includeSheets.push('Other')
    expect(sheetConfig.spreadsheet.includeSheets).toEqual(['Orders'])
    expect(sheetConfig.textSplitterType).toBe('recursive-character')
  })
  it('inherits table defaults while keeping per-document false headers and blank instructions unless batch edits override them', () => {
    const documents = [
      {
        type: 'xlsx',
        category: KBDocumentCategoryEnum.Sheet,
        parserConfig: {
          spreadsheet: { firstRowAsHeader: false, includeSheets: ['Orders'] },
          tableMetadataRequirements: ''
        }
      },
      { type: 'xlsx', category: KBDocumentCategoryEnum.Sheet }
    ]
    const defaults = { spreadsheet: { firstRowAsHeader: true }, tableMetadataRequirements: 'Default instructions' }
    const inherited = buildImportDocuments(documents, defaults, 'kb', null)
    expect(inherited[0].parserConfig.spreadsheet.firstRowAsHeader).toBe(false)
    expect(inherited[0].parserConfig.tableMetadataRequirements).toBe('')
    expect(inherited[1].parserConfig).toMatchObject(defaults)
    const edited = buildImportDocuments(documents, defaults, 'kb', null, {
      tableOverrides: { firstRowAsHeader: true, tableMetadataRequirements: 'New instructions' }
    })
    expect(edited[0].parserConfig.spreadsheet.firstRowAsHeader).toBe(true)
    expect(edited[0].parserConfig.tableMetadataRequirements).toBe('New instructions')
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
    expect(docs[0].parserConfig).toEqual({
      indexedFields: ['sku'],
      spreadsheet: { interpretation: 'records', includeSheets: ['*'] }
    })
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

it('persists displayed record defaults for new spreadsheet imports', () => {
  const [document] = buildImportDocuments([{ category: KBDocumentCategoryEnum.Sheet }], {}, 'kb', null)
  expect(document.parserConfig.spreadsheet).toMatchObject({ interpretation: 'records', includeSheets: ['*'] })
})
