import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertNewKnowledgeComponent layout', () => {
  const template = readFileSync(join(__dirname, 'new.component.html'), 'utf8')
  const source = readFileSync(join(__dirname, 'new.component.ts'), 'utf8')

  it('uses one retrieval settings section and hides the dedicated knowledge graph tab', () => {
    expect(source).toContain("key: 'retrieval'")
    expect(source).not.toContain("key: 'vector'")
    expect(source).not.toContain("key: 'graph'")
    expect(template).toContain("@case ('retrieval')")
    expect(template).toContain('<xp-knowledge-retrieval-settings')
    expect(template).not.toContain("@case ('vector')")
    expect(template).not.toContain("@case ('graph')")
  })

  it('shows parent-child and advanced chunk controls in the chunk settings section', () => {
    expect(template).toContain('data-chunk-parent-child')
    expect(template).toContain('data-chunk-advanced-options')
    expect(template).toContain('data-chunk-max-tokens')
    expect(template).toContain('data-chunk-language-hint')
    expect(template).toContain('togglePosition="before"')
    expect(template).not.toContain('[expanded]="true"')
    expect(source).toContain('readonly parentChildChunkingEnabled')
    expect(source).toContain('readonly maxChunkTokens')
    expect(source).toContain('readonly chunkLanguageHint')
  })

  it('reserves all documented parser engine file types', () => {
    for (const parserType of [
      'markdown',
      'text',
      'json',
      'image',
      'audio',
      'docm',
      'htm',
      'html',
      'odp',
      'ods',
      'odt',
      'pptm',
      'rtf',
      'xlsm',
      'xmind'
    ]) {
      expect(source).toContain(`key: '${parserType}'`)
    }
  })

  it('reserves image processing and automatic tag controls without persisting them', () => {
    expect(template).toContain('data-image-language')
    expect(template).toContain('data-image-requirements')
    expect(template).toContain('data-automatic-tagging')
    expect(source).toContain('readonly imageDescriptionLanguage')
    expect(source).toContain('readonly imageParsingRequirements')
    expect(source).toContain('readonly automaticTaggingEnabled')

    const buildPayload = source.slice(source.indexOf('private buildPayload()'))
    expect(buildPayload).not.toContain('imageDescriptionLanguage')
    expect(buildPayload).not.toContain('imageParsingRequirements')
    expect(buildPayload).not.toContain('automaticTaggingEnabled')
    expect(buildPayload).not.toContain('parentChildChunkingEnabled')
    expect(buildPayload).not.toContain('maxChunkTokens')
    expect(buildPayload).not.toContain('chunkLanguageHint')
  })
})
