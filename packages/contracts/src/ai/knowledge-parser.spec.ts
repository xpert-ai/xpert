import { decodeKnowledgeSeparators, knowledgebaseDocumentParserDefaults } from './knowledge-parser.model'

describe('knowledge parser shared configuration', () => {
  it('copies public language hints while leaving old configurations unset', () => {
    const defaults = { chunkSize: 512, chunkOverlap: 0, delimiter: null }
    expect(knowledgebaseDocumentParserDefaults(defaults).chunkLanguageHint).toBeUndefined()
    for (const chunkLanguageHint of ['auto', 'Chinese', 'English'] as const) {
      const config = knowledgebaseDocumentParserDefaults({ ...defaults, chunkLanguageHint })
      expect(config.chunkLanguageHint).toBe(chunkLanguageHint)
      expect(config.textSplitter).not.toHaveProperty('chunkLanguageHint')
    }
  })
  it('copies token budgets including an explicit opt-out without creating an override for old settings', () => {
    const defaults = { chunkSize: 512, chunkOverlap: 0, delimiter: null }
    expect(knowledgebaseDocumentParserDefaults(defaults)).not.toHaveProperty('maxChunkTokens')
    for (const maxChunkTokens of [0, 256]) {
      expect(knowledgebaseDocumentParserDefaults({ ...defaults, maxChunkTokens })).toHaveProperty(
        'maxChunkTokens',
        maxChunkTokens
      )
    }
  })
  it('decodes all ordered separators while preserving literal commas and empty lists', () => {
    expect(decodeKnowledgeSeparators(['\\n\\n', '!', '?', ',', '\\t'])).toEqual(['\n\n', '!', '?', ',', '\t'])
    expect(decodeKnowledgeSeparators([])).toEqual([])
    expect(decodeKnowledgeSeparators('a,,b,c')).toEqual(['a,b', 'c'])
    expect(decodeKnowledgeSeparators('\\n\\n,\\n, ,')).toEqual(['\n\n', '\n', ' ', ''])
  })

  it('copies only configured values and keeps zero overlap and an explicit image opt-out', () => {
    expect(knowledgebaseDocumentParserDefaults()).toEqual({})
    const defaults = {
      chunkSize: 512,
      chunkOverlap: 0,
      delimiter: null,
      separators: [],
      imageUnderstandingEnabled: false,
      pdfParser: { transformerType: 'pdf-visual' }
    }
    expect(knowledgebaseDocumentParserDefaults(defaults, 'pdf')).toMatchObject({
      chunkSize: 512,
      chunkOverlap: 0,
      textSplitter: { chunkSize: 512, chunkOverlap: 0 },
      separators: [],
      imageUnderstandingEnabled: false,
      transformerType: 'pdf-visual'
    })
    expect(knowledgebaseDocumentParserDefaults(defaults, 'txt')).not.toHaveProperty('transformerType')
  })
})
