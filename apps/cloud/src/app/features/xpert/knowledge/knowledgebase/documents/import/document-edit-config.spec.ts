import { documentProcessingDraft, editedDocumentParserConfig } from './document-edit-config'

it('inherits, overrides and reopens public document language settings', () => {
  const defaults = { chunkSize: 512, chunkOverlap: 0, delimiter: null, chunkLanguageHint: 'Chinese' as const }
  expect(documentProcessingDraft({ type: 'txt' }, defaults).chunkLanguageHint).toBe('Chinese')
  const document = { type: 'txt', parserConfig: { chunkLanguageHint: 'English' as const } }
  const draft = { ...defaults, ...documentProcessingDraft(document, defaults) }
  expect(draft.chunkLanguageHint).toBe('English')
  const saved = editedDocumentParserConfig(document, draft, defaults)
  expect(saved.chunkLanguageHint).toBe('English')
  expect(saved.textSplitter).not.toHaveProperty('chunkLanguageHint')
  expect(documentProcessingDraft({ ...document, parserConfig: saved }, defaults).chunkLanguageHint).toBe('English')
})

describe('editing document processing settings', () => {
  it('reopens legacy cleared parser fields using the library parser and its integration', () => {
    const selection = {
      transformerType: 'mineru',
      transformerIntegration: 'mineru-connection',
      transformer: { isOcr: false }
    }
    const draft = documentProcessingDraft(
      { type: 'pdf', parserConfig: { transformerType: null, transformer: null, transformerIntegration: null } },
      { parsers: { pdf: selection } }
    )
    expect(draft.parsers.pdf).toEqual(selection)
    expect(draft.pdfParser).toEqual(selection)
  })

  it('inherits the library token budget and preserves an explicit per-document opt-out when reopening and saving', () => {
    const defaults = { chunkSize: 512, chunkOverlap: 0, delimiter: null, maxChunkTokens: 256 }
    expect(documentProcessingDraft({ type: 'txt' }, defaults).maxChunkTokens).toBe(256)
    const document = { type: 'pdf', parserConfig: { maxChunkTokens: 0 } }
    const draft = documentProcessingDraft(document, defaults)
    expect(draft.maxChunkTokens).toBe(0)
    expect(editedDocumentParserConfig(document, { ...defaults, ...draft }, defaults).maxChunkTokens).toBe(0)
  })
  it('prefers document overrides and keeps provider-specific options isolated from defaults', () => {
    const draft = documentProcessingDraft(
      {
        type: 'pdf',
        parserConfig: {
          textSplitter: { chunkSize: 900, separators: ['!'] },
          transformerType: 'custom',
          transformer: { dpi: 200 },
          imageUnderstandingEnabled: false
        }
      },
      {
        chunkSize: 512,
        chunkOverlap: 80,
        delimiter: null,
        separators: ['?'],
        textSplitter: { chunkOverlap: 80 },
        pdfParser: { transformerType: 'pdf-visual', transformer: { renderScale: 2 } },
        imageUnderstandingEnabled: true
      }
    )
    expect(draft.textSplitter).toEqual({ chunkSize: 900, chunkOverlap: 80, separators: ['!'] })
    expect(draft.separators).toBeUndefined()
    expect(draft.pdfParser).toEqual({
      transformerType: 'custom',
      transformer: { dpi: 200 },
      transformerIntegration: undefined
    })
    expect(draft.imageUnderstandingEnabled).toBe(false)
  })

  it('retains unexposed document settings and explicitly resets a PDF parser to its inherited default', () => {
    const config = editedDocumentParserConfig(
      {
        type: 'pdf',
        parserConfig: { transformerType: 'custom', transformer: { dpi: 200 }, pages: [[1, 2]], removeSensitive: true }
      },
      { chunkSize: 700, chunkOverlap: 80, delimiter: null, textSplitter: { chunkSize: 700 } },
      {
        chunkSize: 512,
        chunkOverlap: 80,
        delimiter: null,
        pdfParser: { transformerType: 'pdf-visual', transformer: { renderScale: 2 } }
      }
    )
    expect(config).toMatchObject({
      pages: [[1, 2]],
      removeSensitive: true,
      chunkSize: 700,
      transformerType: 'pdf-visual',
      transformer: { renderScale: 2 }
    })
    expect(config.transformer).not.toHaveProperty('dpi')
  })
})

it('inherits library table defaults while preserving explicit header false and an empty requirement', () => {
  const draft = documentProcessingDraft(
    {
      type: 'xlsx',
      parserConfig: {
        spreadsheet: { firstRowAsHeader: false, includeSheets: ['Orders'] },
        tableMetadataRequirements: ''
      }
    },
    { spreadsheet: { firstRowAsHeader: true }, tableMetadataRequirements: 'Default requirement' }
  )
  expect(draft.spreadsheet).toEqual({ firstRowAsHeader: false, includeSheets: ['Orders'] })
  expect(draft.tableMetadataRequirements).toBe('')
})

it('switches an image parser, drops old connection/options, and restores the current library choice', () => {
  const defaults = {
    chunkSize: 512,
    chunkOverlap: 0,
    delimiter: null,
    parsers: { png: { transformerType: 'baidu-paddleocr-vl', transformerIntegration: 'baidu' } }
  }
  const doc = {
    type: 'png',
    parserConfig: { transformerType: 'mineru', transformerIntegration: 'mineru', transformer: { isOcr: true } }
  }
  const reopened = documentProcessingDraft(doc, defaults)
  expect(reopened.parsers.png.transformerType).toBe('mineru')
  const selected = editedDocumentParserConfig(
    doc,
    { ...defaults, parsers: { png: { transformerType: 'builtin' } } },
    defaults
  )
  expect(selected).toMatchObject({ transformerType: 'builtin', transformerIntegration: null, transformer: null })
  const inherited = editedDocumentParserConfig(doc, { ...defaults, parsers: { png: null } }, defaults)
  expect(inherited).toMatchObject({
    transformerType: 'baidu-paddleocr-vl',
    transformerIntegration: 'baidu',
    transformer: null
  })
})

it('does not resurrect old library options when reopening a document using another integration', () => {
  const defaults = {
    chunkSize: 512,
    chunkOverlap: 80,
    delimiter: null,
    parsers: {
      pdf: {
        transformerType: 'mineru',
        transformerIntegration: 'old',
        transformer: { modelVersion: 'pipeline', isOcr: false }
      }
    }
  }
  const document = {
    type: 'pdf',
    parserConfig: { transformerType: 'mineru', transformerIntegration: 'new', transformer: {} }
  }
  const draft = { ...defaults, ...documentProcessingDraft(document, defaults) }
  expect(draft.parsers.pdf.transformer).toEqual({})
  const saved = editedDocumentParserConfig(document, draft, defaults)
  expect(saved.transformer).toEqual({})
  expect(saved.transformerIntegration).toBe('new')
})
