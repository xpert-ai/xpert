import { documentProcessingDraft, editedDocumentParserConfig } from './document-edit-config'

describe('editing document processing settings', () => {
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
