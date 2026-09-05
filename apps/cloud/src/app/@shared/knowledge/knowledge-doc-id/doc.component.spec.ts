import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('KnowledgeDocIdComponent', () => {
  const source = readFileSync(join(__dirname, 'doc.component.ts'), 'utf8')
  const template = readFileSync(join(__dirname, 'doc.component.html'), 'utf8')
  const chunkTemplate = readFileSync(join(__dirname, '../chunk/chunk.component.html'), 'utf8')

  it('renders a Zard FAQ icon from the explicit chunk content kind', () => {
    expect(source).toContain("input<IKnowledgeFAQChunkMetadata['contentKind'] | undefined>()")
    expect(template).toContain("@if (contentKind() === 'faq')")
    expect(template).toContain('<z-icon zType="help_outline"')
    expect(chunkTemplate).toContain('[contentKind]="chunk().metadata.contentKind"')
  })
})
