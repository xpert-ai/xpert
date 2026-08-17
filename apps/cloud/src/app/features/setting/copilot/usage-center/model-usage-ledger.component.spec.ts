import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AiModelTypeEnum, IModelUsageLedger } from '@xpert-ai/contracts'
import { groupUsageByAccount } from './model-usage-ledger.component'

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
    expect(template).toContain('item.settlementAmount')
    expect(template).toContain('item.exchangeRates')
  })

  it('shows mixed usage units in one table', () => {
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(template).toContain('[selectOptions]="modalities()"')
    expect(template).toContain('[selectOptions]="units()"')
    expect(template).toContain('XP.Copilot.Usage')
    expect(template).toContain('usage.unit')
    expect(source).toContain("value: 'audio'")
    expect(source).toContain("value: 'character'")
    expect(source).toContain("value: 'request'")
    expect(source).toContain("if (unit === 'character')")
    expect(source).toContain("if (unit === 'request')")
  })

  it('does not render or request summary cards', () => {
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(source).not.toContain('summaryCards')
    expect(source).not.toContain('getModelUsageLedgerTotals')
    expect(template).not.toContain('summaryCards()')
  })

  it('combines all metrics from one model invocation in one detail row', () => {
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')

    expect(source).toContain('groupUsageInvocations')
    expect(template).toContain('@for (usage of item.usages; track usage.key)')
    expect(template).not.toContain('rowUsage(item)')
  })

  it('treats priced generation and unpriced token metrics as one priced invocation', () => {
    const recordedAt = new Date('2026-08-17T10:44:49.145Z')
    const generation = modelUsageLedger({
      id: 'generation-ledger',
      metricKey: 'generation',
      unit: 'generation',
      quantity: 1,
      recordedAt,
      charge: {
        usageLedgerId: 'generation-ledger',
        pricingStatus: 'priced',
        unit: 'generation',
        quantity: 1,
        amount: 0.25,
        currency: 'CNY',
        settlementAmount: 0.25,
        settlementCurrency: 'CNY',
        chargedAt: recordedAt
      }
    })
    const token = modelUsageLedger({
      id: 'token-ledger',
      metricKey: 'token',
      unit: 'token',
      totalTokens: 16_384,
      recordedAt,
      charge: {
        usageLedgerId: 'token-ledger',
        pricingStatus: 'unpriced',
        unit: 'token',
        quantity: 16_384,
        chargedAt: recordedAt
      }
    })

    const groups = groupUsageByAccount([generation, token])

    expect(groups).toHaveLength(1)
    expect(groups[0].items).toEqual([
      expect.objectContaining({
        pricingStatus: 'priced',
        usages: expect.arrayContaining([
          expect.objectContaining({ unit: 'generation', quantity: 1 }),
          expect.objectContaining({ unit: 'token', quantity: 16_384 })
        ]),
        originalAmounts: [{ currency: 'CNY', amount: 0.25 }],
        settlementAmount: 0.25
      })
    ])
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

function modelUsageLedger(overrides: Partial<IModelUsageLedger>): IModelUsageLedger {
  return {
    requestId: 'call-1',
    revision: 1,
    userId: 'user-1',
    userName: 'Yu Rongku',
    originType: 'tool',
    originId: 'execution-1',
    originExecutionId: 'execution-1',
    copilotId: 'copilot-1',
    providerScopeId: 'provider-scope-1',
    provider: 'volcengine',
    model: 'doubao-seedream-4-5-251128',
    modelType: AiModelTypeEnum.IMAGE,
    toolName: 'seedream_text_to_image',
    modality: 'image',
    operation: 'text_to_image',
    metricKey: 'generation',
    unit: 'generation',
    authority: 'provider',
    quantity: 1,
    recordedAt: new Date('2026-08-17T10:44:49.145Z'),
    ...overrides
  }
}
