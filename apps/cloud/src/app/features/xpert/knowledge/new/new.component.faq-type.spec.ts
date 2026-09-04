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

  it('shows the FAQ retrieval section and hides document indexing strategy', () => {
    expect(source).toContain("| 'faq'")
    expect(source).toContain(
      "const FAQ_SECTION_KEYS: readonly SectionKey[] = ['basic', 'models', 'vector-storage', 'retrieval', 'faq']"
    )
    expect(source).toContain('if (!this.retrievalConfigurationValid())')
    expect(template).toContain('@if (!isFAQ())')
    expect(template).toContain("@case ('faq')")
    expect(template).toContain('[allowGraphRetrieval]="!isFAQ()"')
    expect(template).toContain('[defaultMode]=' + "\"isFAQ() ? 'hybrid' : 'vector'\"")
  })

  it('shows vector storage as an independent settings section', () => {
    expect(source).toContain("| 'vector-storage'")
    expect(source).toContain("key: 'vector-storage'")
    expect(source).toContain("labelKey: 'Sections.VectorStorage'")
    expect(template).toContain("@case ('vector-storage')")
    expect(template).toContain("'.VectorStorage.SystemDefault'")
  })

  it('persists FAQ configuration on creation and locks it after creation', () => {
    expect(contracts).toContain('export type KnowledgebaseFAQConfig = {')
    expect(contracts).toContain("negativeMatchMode: 'exact'")
    expect(source).toContain('faqConfig: this.faqConfig()')
    expect(source).toContain('readonly faqConfigurationDisabled = computed(() => this.isEditMode() && this.isFAQ())')
    expect(template).toContain('[disabled]="faqConfigurationDisabled()"')
    expect(template).toContain("updateFAQConfig('negativeMatchMode', $event)")
    expect(template).toContain('value="semantic" [disabled]="true"')
  })
})
