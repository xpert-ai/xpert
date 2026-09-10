import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertNewKnowledgeComponent layout', () => {
  const template = readFileSync(join(__dirname, 'new.component.html'), 'utf8')
  const processingTemplate = readFileSync(join(__dirname, '../processing/processing-settings.component.html'), 'utf8')
  const processingSource = readFileSync(join(__dirname, '../processing/processing-form.ts'), 'utf8')
  const source = readFileSync(join(__dirname, 'new.component.ts'), 'utf8')
  const parserRows = readFileSync(join(__dirname, '../processing/parser-engine-rows.ts'), 'utf8')

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
    expect(processingTemplate).toContain('data-chunk-parent-child')
    expect(processingTemplate).toContain('data-chunk-advanced-options')
    expect(processingTemplate).toContain('data-chunk-max-tokens')
    expect(processingTemplate).toContain('data-chunk-language-hint')
    expect(processingTemplate).toContain('togglePosition="before"')
    expect(processingTemplate).not.toContain('[expanded]="true"')
    expect(processingSource).toContain('const parentChildChunkingEnabled')
    expect(processingSource).toContain('const maxChunkTokens')
    expect(processingSource).toContain('const chunkLanguageHint')
  })

  it('keeps the bottom chunk preview connected to the current processing draft', () => {
    const chunkSection = template.slice(template.indexOf("@case ('chunk')"), template.indexOf("@case ('image')"))
    expect(chunkSection).toContain('<xp-knowledge-chunk-preview')
    expect(chunkSection).toContain('[workspaceId]="workspaceId()"')
    expect(chunkSection).toContain('[config]="processing.config()"')
    expect(source).toContain('KnowledgeChunkPreviewComponent,')
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
      expect(parserRows).toContain(`key: '${parserType}'`)
    }
  })

  it('uses one image prompt template and keeps later advanced capabilities reserved', () => {
    expect(processingTemplate).toContain('data-image-prompt')
    expect(template).toContain('data-automatic-tagging')
    expect(processingSource).toContain('const imagePromptTemplate')
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
