import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('XpertNewKnowledgeComponent FAQ type', () => {
  const template = readFileSync(join(__dirname, 'new.component.html'), 'utf8')
  const source = readFileSync(join(__dirname, 'new.component.ts'), 'utf8')
  const contracts = readFileSync(
    join(__dirname, '../../../../../../../../packages/contracts/src/ai/knowledgebase.model.ts'),
    'utf8'
  )

  it('exposes Q&A as a supported knowledge base type', () => {
    const faqOption = template.match(
      /<z-toggle-group-item[\s\S]*?KnowledgebaseTypeEnum\.FAQ[\s\S]*?<\/z-toggle-group-item>/
    )?.[0]

    expect(contracts).toContain("FAQ = 'faq'")
    expect(faqOption).toContain('[value]="KnowledgebaseTypeEnum.FAQ"')
    expect(faqOption).toContain('[disabled]="isEditMode()"')
    expect(faqOption).not.toContain('kb-mini-badge')
  })

  it('submits the selected knowledge base type', () => {
    expect(source).toContain('payload.type = this.type()')
    expect(source).not.toContain('payload.type = KnowledgebaseTypeEnum.Standard')
  })
})
