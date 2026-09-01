import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AiModelTypeEnum, IModelUsageLedger } from '@xpert-ai/contracts'
import { groupUsageInvocations } from './model-usage-ledger.component'

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

    const invocations = groupUsageInvocations([generation, token])

    expect(invocations).toHaveLength(1)
    expect(invocations).toEqual([
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

  it('drills into account details in the same table region instead of nesting another table', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(source).toContain('groupUsageInvocations(this.items())')
    expect(source).toContain('selectedAccount')
    expect(source).toContain('detailDimension')
    expect(template).toContain('@for (group of accountGroups(); track group.key)')
    expect(template).toContain('(click)="selectAccount(group)"')
    expect(template).toContain('XP.KEY_WORDS.Actions')
    expect(template).toContain('XP.ACTIONS.ViewDetails')
    expect(template).toContain('(click)="backToAccounts()"')
    expect(template).toContain('@switch (detailDimension())')
    expect(template).toContain('group.userName')
    expect(template.indexOf('<z-toggle-group')).toBeLessThan(
      template.indexOf("usageQuantity(account, 'text', 'token')")
    )
    expect(source).not.toContain('selectedAccountGroup')
    expect(template).not.toContain('zType="secondary"')
    expect(template).not.toContain('isAccountExpanded')
    expect(template).not.toContain('toggleAccount')
    expect(template).not.toContain('colspan="6"')
    expect(template).not.toContain('{{ group.userId')
  })

  it('refreshes the selected account summary with the active detail filters', () => {
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(source).toContain('forkJoin({')
    expect(source).toContain('account: this.usageService.getModelUsageAccounts')
    expect(source).toContain('this.acceptSelectedAccount(account.items[0])')
  })

  it('treats a cleared time range as all time', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(template).toContain('(ngModelChange)="changeTimeRange($event)"')
    expect(source).toContain('changeTimeRange(value: TimeRangeEnum | null)')
    expect(source).toContain('this.timeRangeValue.set(value ?? TimeRangeEnum.All)')
  })

  it('keeps the model detail header aligned and emphasizes the summary values', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const modelCase = template.slice(template.indexOf("@case ('model')"), template.indexOf("@case ('provider')"))

    expect(modelCase.match(/<th z-table-head/g)).toHaveLength(6)
    expect(template.match(/mt-1 truncate text-xl font-semibold text-text-primary/g)).toHaveLength(3)
  })

  it('provides the new usage-center labels in the en-US catalog', () => {
    const enUs = JSON.parse(readFileSync(join(__dirname, '../../../../../assets/i18n/en-US.json'), 'utf8'))

    expect(enUs.XP.ACTIONS.ViewDetails).toBe('View details')
    expect(enUs.XP.Copilot).toMatchObject({
      UsageDetails: 'Usage details',
      ByModel: 'By model',
      ByProvider: 'By provider',
      InvocationRecords: 'Invocation records',
      Calls: 'Calls',
      UsageLoadFailed: 'Unable to load usage data'
    })
  })

  it('shows priced LLM, video, and total settlement amounts in each account row', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(source).toContain('items.map(toAccountRow)')
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

  it('uses the standard paginator instead of load-more or infinite-scroll controls', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(template).toContain('<z-paginator')
    expect(template).toContain('[length]="total()"')
    expect(template).toContain('[pageIndex]="pageIndex()"')
    expect(template).toContain('(page)="onPage($event)"')
    expect(template).not.toContain('(click)="loadMore()"')
    expect(template).not.toContain('ri-arrow-down-wide-line')
    expect(template).not.toContain('waIntersectionObservee')
    expect(source).toContain('ZardPaginatorComponent')
    expect(source).toContain('onPage(event: ZardPageEvent)')
    expect(source).toContain('getModelUsageAccounts')
    expect(source).toContain('getModelUsageBreakdown')
    expect(source).not.toContain('loadMore(')
  })

  it('shows load failures separately from successful empty results', () => {
    const template = readFileSync(join(__dirname, 'model-usage-ledger.component.html'), 'utf8')
    const source = readFileSync(join(__dirname, 'model-usage-ledger.component.ts'), 'utf8')

    expect(source).toContain('readonly loadFailed = signal(false)')
    expect(source).toContain('this.loadFailed.set(false)')
    expect(source).toContain('this.loadFailed.set(true)')
    expect(template).toContain('@if (!loading() && loadFailed())')
    expect(template).toContain('XP.Copilot.UsageLoadFailed')
    expect(template).toContain('(click)="reload()"')
    expect(template).toContain('@else if (!loading() && total() === 0)')
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
