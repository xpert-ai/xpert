import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('ModelUsageLedgerComponent template', () => {
  it('is the single usage-center table for all model usage', () => {
    const usageCenter = readFileSync(join(__dirname, 'usage-center.component.html'), 'utf8')

    expect(usageCenter).toContain('<xp-model-usage-ledger')
    expect(usageCenter).not.toContain('usageMode')
  })

  it('shows original and RMB settlement amounts separately', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(template).toContain('XP.Copilot.OriginalAmount')
    expect(template).toContain('XP.Copilot.CnySettlement')
    expect(template).toContain('total.settlementAmount')
    expect(template).toContain('item.charge.exchangeRate')
  })

  it('shows mixed usage units in one table', () => {
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(template).toContain('[selectOptions]="modalities()"')
    expect(template).toContain('[selectOptions]="units()"')
    expect(template).toContain('XP.Copilot.Usage')
    expect(template).toContain('item.unit')
    expect(source).toContain("value: 'audio'")
    expect(source).toContain("value: 'character'")
    expect(source).toContain("value: 'request'")
    expect(source).toContain("if (unit === 'character')")
    expect(source).toContain("if (unit === 'request')")
  })

  it('separates every model modality and metering unit without dropping summary records', () => {
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(source).toContain('usageCategoryKey(total.modality, total.unit)')
    expect(source).not.toContain('if (!category) continue')
    expect(template).toContain('@for (total of summaryCards(); track total.key)')
    expect(template).toContain('total.originalAmounts')
  })

  it('groups usage by account and expands account details', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(source).toContain('groupUsageByAccount(this.items())')
    expect(source).toContain('expandedAccountKeys')
    expect(template).toContain('@for (group of accountGroups(); track group.key)')
    expect(template).toContain('@if (isAccountExpanded(group))')
    expect(template).toContain('(click)="toggleAccount(group)"')
    expect(template).toContain('group.userName')
    expect(template).not.toContain('{{ group.userId')
  })

  it('shows priced LLM, video, and total settlement amounts in each account row', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(source).toContain("item.charge?.pricingStatus === 'priced'")
    expect(source).toContain('group.pricedAmounts.total += amount')
    expect(template).toContain('XP.Copilot.LlmPrice')
    expect(template).toContain('group.pricedAmounts.llm')
    expect(template).toContain('XP.Copilot.VideoPrice')
    expect(template).toContain('group.pricedAmounts.video')
    expect(template).toContain('XP.Copilot.TotalPrice')
    expect(template).toContain('group.pricedAmounts.total')
  })

  it('keeps the account table scrollable and labels empty selectors', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(template).toContain('min-h-0 flex-1 overflow-auto')
    expect(template).toContain('min-w-max w-full')
    expect(template).toContain('[placeholder]="modalities()[0].label"')
    expect(template).toContain('[placeholder]="units()[0].label"')
    expect(template).toContain('[placeholder]="pricingStatuses()[0].label"')
  })
})
