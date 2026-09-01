import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IModelUsageLedger,
  ModelUsageAccountSummary,
  ModelUsageBreakdownSummary,
  ModelUsageLedgerModality,
  ModelUsageLedgerQuery,
  ModelUsageMetric,
  ModelUsagePricingStatus
} from '@xpert-ai/contracts'
import {
  calcTimeRange,
  TimeRangeEnum,
  TimeRangeOptions,
  XpSpinComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  type ZardPageEvent,
  ZardPaginatorComponent,
  ZardTableImports,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent
} from '@xpert-ai/headless-ui'
import { forkJoin } from 'rxjs'
import { startWith } from 'rxjs/operators'
import { XpSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { CopilotUsageService, DateRelativePipe, RequestScopeLevel, Store, ToastrService } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'xp-model-usage-ledger',
  templateUrl: './model-usage-ledger.component.html',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    XpSelectComponent,
    XpSpinComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardPaginatorComponent,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
    ...ZardTableImports,
    DateRelativePipe
  ]
})
export class ModelUsageLedgerComponent {
  readonly usageService = inject(CopilotUsageService)
  readonly toastr = inject(ToastrService)
  readonly translate = inject(TranslateService)
  readonly #store = inject(Store)
  #loadVersion = 0

  readonly languageChange = toSignal(this.translate.onLangChange.pipe(startWith(null)))
  readonly activeScope = toSignal(this.#store.selectActiveScope(), { initialValue: this.#store.activeScope })
  readonly selectedOrganization = toSignal(this.#store.selectedOrganization$)
  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly providerFilter = model('')
  readonly modelFilter = model('')
  readonly userFilter = model('')
  readonly organizationFilter = model('')
  readonly currencyFilter = model('')
  readonly modalityFilter = model<ModelUsageLedgerModality | ''>('')
  readonly unitFilter = model<ModelUsageMetric['unit'] | ''>('')
  readonly pricingStatusFilter = model<ModelUsagePricingStatus | ''>('')

  readonly items = signal<IModelUsageLedger[]>([])
  readonly accountGroups = signal<ModelUsageAccountRow[]>([])
  readonly selectedAccount = signal<ModelUsageAccountRow | null>(null)
  readonly detailDimension = signal<ModelUsageDetailDimension>('model')
  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly pageIndex = signal(0)
  readonly pageSize = signal(30)
  readonly total = signal(0)

  readonly timeRanges = computed(() => {
    this.languageChange()
    return TimeRangeOptions.map((option) => ({
      value: option.value,
      label: this.translate.instant(`XP.TimeRange.${option.value}`, {
        Default: typeof option.label === 'string' ? option.label : option.label.en_US
      })
    }))
  })
  readonly modalities = computed(() => {
    this.languageChange()
    return [
      { value: '', label: this.translate.instant('XP.Copilot.AllModalities', { Default: 'All modalities' }) },
      { value: 'text', label: this.translate.instant('XP.Copilot.Text', { Default: 'Text' }) },
      { value: 'audio', label: this.translate.instant('XP.Copilot.Audio', { Default: 'Audio' }) },
      { value: 'image', label: this.translate.instant('XP.Copilot.Image', { Default: 'Image' }) },
      { value: 'video', label: this.translate.instant('XP.Copilot.Video', { Default: 'Video' }) }
    ] as Array<{ value: ModelUsageLedgerModality | ''; label: string }>
  })
  readonly units = computed(() => {
    this.languageChange()
    return [
      { value: '', label: this.translate.instant('XP.Copilot.AllUnits', { Default: 'All units' }) },
      { value: 'token', label: this.translate.instant('XP.Copilot.Token', { Default: 'Token' }) },
      { value: 'generation', label: this.translate.instant('XP.Copilot.Generation', { Default: 'Generation' }) },
      { value: 'second', label: this.translate.instant('XP.Copilot.Second', { Default: 'Second' }) },
      { value: 'character', label: this.translate.instant('XP.Copilot.Character', { Default: 'Characters' }) },
      { value: 'request', label: this.translate.instant('XP.Copilot.Request', { Default: 'Requests' }) }
    ] as Array<{ value: ModelUsageMetric['unit'] | ''; label: string }>
  })
  readonly pricingStatuses = computed(() => {
    this.languageChange()
    return [
      { value: '', label: this.translate.instant('XP.KEY_WORDS.All', { Default: 'All pricing' }) },
      { value: 'priced', label: this.translate.instant('XP.Copilot.Priced', { Default: 'Priced' }) },
      { value: 'free', label: this.translate.instant('XP.Copilot.Free', { Default: 'Free' }) },
      { value: 'unpriced', label: this.translate.instant('XP.Copilot.Unpriced', { Default: 'Unpriced' }) }
    ] as Array<{ value: ModelUsagePricingStatus | ''; label: string }>
  })
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly currentOrganizationId = computed(() => {
    const scope = this.activeScope()
    return scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : undefined
  })
  readonly scopeName = computed(
    () =>
      this.selectedOrganization()?.name ||
      this.translate.instant('XP.Scope.OrganizationEyebrow', { Default: 'Organization Scope' })
  )
  readonly detailInvocations = computed(() => groupUsageInvocations(this.items()))
  readonly modelGroups = signal<ModelUsageModelGroup[]>([])
  readonly providerGroups = signal<ModelUsageProviderGroup[]>([])

  constructor() {
    effect(
      () => {
        this.activeScope()
        this.selectedAccount.set(null)
        if (!this.isTenantScope() && untracked(() => this.organizationFilter())) this.organizationFilter.set('')
        untracked(() => this.reload())
      },
      { allowSignalWrites: true }
    )
  }

  reload() {
    this.loadPage(0, this.pageSize())
  }

  loadPage(pageIndex = this.pageIndex(), pageSize = this.pageSize()) {
    const version = ++this.#loadVersion
    this.loading.set(true)
    this.loadFailed.set(false)
    const query = this.query()
    const params = {
      ...query,
      take: pageSize,
      skip: pageIndex * pageSize
    }
    const selectedAccount = this.selectedAccount()
    const detailDimension = this.detailDimension()
    if (selectedAccount && detailDimension !== 'invocation') {
      forkJoin({
        account: this.usageService.getModelUsageAccounts({ ...query, take: 1, skip: 0 }),
        breakdown: this.usageService.getModelUsageBreakdown(detailDimension, params)
      }).subscribe({
        next: ({ account, breakdown: { items, total } }) => {
          if (version !== this.#loadVersion) return
          this.items.set([])
          if (detailDimension === 'model') this.modelGroups.set(items.map(toModelGroup))
          else this.providerGroups.set(items.map(toProviderGroup))
          this.acceptSelectedAccount(account.items[0])
          this.acceptPage(pageIndex, pageSize, total)
        },
        error: (error) => this.handleError(error, version)
      })
    } else if (selectedAccount) {
      forkJoin({
        account: this.usageService.getModelUsageAccounts({ ...query, take: 1, skip: 0 }),
        ledger: this.usageService.getModelUsageLedger(params)
      }).subscribe({
        next: ({ account, ledger: { items, total } }) => {
          if (version !== this.#loadVersion) return
          this.items.set(items)
          this.acceptSelectedAccount(account.items[0])
          this.acceptPage(pageIndex, pageSize, total)
        },
        error: (error) => this.handleError(error, version)
      })
    } else {
      this.usageService.getModelUsageAccounts(params).subscribe({
        next: ({ items, total }) => {
          if (version !== this.#loadVersion) return
          this.items.set([])
          this.accountGroups.set(items.map(toAccountRow))
          this.acceptPage(pageIndex, pageSize, total)
        },
        error: (error) => this.handleError(error, version)
      })
    }
  }

  onPage(event: ZardPageEvent) {
    this.loadPage(event.pageIndex, event.pageSize)
  }

  pricingLabel(status: ModelUsagePricingStatus) {
    if (status === 'free') return this.translate.instant('XP.Copilot.Free', { Default: 'Free' })
    if (status === 'unpriced') return this.translate.instant('XP.Copilot.Unpriced', { Default: 'Unpriced' })
    return this.translate.instant('XP.Copilot.Priced', { Default: 'Priced' })
  }

  unitLabel(unit: ModelUsageMetric['unit']) {
    if (unit === 'generation') {
      return this.translate.instant('XP.Copilot.Generation', { Default: 'Generation' })
    }
    if (unit === 'second') {
      return this.translate.instant('XP.Copilot.Second', { Default: 'Second' })
    }
    if (unit === 'character') {
      return this.translate.instant('XP.Copilot.Character', { Default: 'Characters' })
    }
    if (unit === 'request') {
      return this.translate.instant('XP.Copilot.Request', { Default: 'Requests' })
    }
    return this.translate.instant('XP.Copilot.Token', { Default: 'Token' })
  }

  modalityLabel(modality: ModelUsageLedgerModality) {
    if (modality === 'audio') return this.translate.instant('XP.Copilot.Audio', { Default: 'Audio' })
    if (modality === 'image') return this.translate.instant('XP.Copilot.Image', { Default: 'Image' })
    if (modality === 'video') return this.translate.instant('XP.Copilot.Video', { Default: 'Video' })
    return this.translate.instant('XP.Copilot.Text', { Default: 'Text' })
  }

  usageLabel(modality: ModelUsageLedgerModality, unit: ModelUsageMetric['unit']) {
    if (modality === 'text' && unit === 'token') {
      return this.translate.instant('XP.Copilot.LlmToken', { Default: 'LLM Token' })
    }
    if (modality === 'image' && unit === 'token') {
      return this.translate.instant('XP.Copilot.ImageToken', { Default: 'Image Token' })
    }
    if (modality === 'image' && unit === 'generation') {
      return this.translate.instant('XP.Copilot.ImageGeneration', { Default: 'Image generation' })
    }
    if (modality === 'video' && unit === 'token') {
      return this.translate.instant('XP.Copilot.VideoToken', { Default: 'Video Token' })
    }
    if (modality === 'video' && unit === 'generation') {
      return this.translate.instant('XP.Copilot.VideoGeneration', { Default: 'Video generation' })
    }
    if (modality === 'video' && unit === 'second') {
      return this.translate.instant('XP.Copilot.VideoSecond', { Default: 'Video seconds' })
    }
    return `${this.modalityLabel(modality)} · ${this.unitLabel(unit)}`
  }

  usageQuantity(group: ModelUsageAccountRow, modality: ModelUsageLedgerModality, unit: ModelUsageMetric['unit']) {
    return group.usages.find((usage) => usage.modality === modality && usage.unit === unit)?.quantity ?? 0
  }

  selectAccount(group: ModelUsageAccountRow) {
    this.selectedAccount.set(group)
    this.detailDimension.set('model')
    this.reload()
  }

  backToAccounts() {
    if (!this.selectedAccount()) return
    this.selectedAccount.set(null)
    this.reload()
  }

  changeDetailDimension(value: unknown) {
    if (value === 'model' || value === 'provider' || value === 'invocation') {
      if (value === this.detailDimension()) return
      this.detailDimension.set(value)
      this.reload()
    }
  }

  changeTimeRange(value: TimeRangeEnum | null) {
    this.timeRangeValue.set(value ?? TimeRangeEnum.All)
    this.reload()
  }

  private query(): ModelUsageLedgerQuery {
    const [start, end] = calcTimeRange(this.timeRangeValue())
    const selectedAccount = this.selectedAccount()
    return {
      start,
      end,
      unit: this.unitFilter() || undefined,
      provider: clean(this.providerFilter()),
      model: clean(this.modelFilter()),
      userId: selectedAccount ? (selectedAccount.userId ?? undefined) : clean(this.userFilter()),
      userIdentity: selectedAccount?.userId === null ? 'unidentified' : undefined,
      organizationId: this.isTenantScope() ? clean(this.organizationFilter()) : this.currentOrganizationId(),
      currency: clean(this.currencyFilter()),
      modality: this.modalityFilter() || undefined,
      pricingStatus: this.pricingStatusFilter() || undefined
    }
  }

  private handleError(error: unknown, version: number) {
    if (version !== this.#loadVersion) return
    this.loading.set(false)
    this.loadFailed.set(true)
    this.toastr.error(error, this.translate.instant('XP.KEY_WORDS.Error', { Default: 'Error' }))
  }

  private acceptSelectedAccount(summary?: ModelUsageAccountSummary) {
    const current = this.selectedAccount()
    if (!current) return
    this.selectedAccount.set(
      summary
        ? toAccountRow(summary)
        : {
            ...current,
            usages: [],
            pricedAmounts: { llm: 0, video: 0, total: 0 }
          }
    )
  }

  private acceptPage(pageIndex: number, pageSize: number, total: number) {
    this.pageIndex.set(pageIndex)
    this.pageSize.set(pageSize)
    this.total.set(total)
    this.loading.set(false)
  }
}

function clean(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

type ModelUsageAccountRow = Omit<ModelUsageAccountSummary, 'usages'> & {
  key: string
  usages: ModelUsageDisplayUsage[]
}

type ModelUsageDetailDimension = 'model' | 'provider' | 'invocation'

function toAccountRow(summary: ModelUsageAccountSummary): ModelUsageAccountRow {
  return {
    ...summary,
    key: summary.userId ?? '__unknown_account__',
    usages: summary.usages.map((usage) => ({
      ...usage,
      key: usageCategoryKey(usage.modality, usage.unit)
    }))
  }
}

function toModelGroup(summary: ModelUsageBreakdownSummary): ModelUsageModelGroup {
  return {
    key: summary.key,
    provider: summary.provider,
    model: summary.model,
    usages: withUsageKeys(summary),
    calls: summary.calls,
    lastUsedAt: summary.lastUsedAt,
    pricingStatus: summary.pricingStatus,
    settlementAmount: summary.settlementAmount
  }
}

function toProviderGroup(summary: ModelUsageBreakdownSummary): ModelUsageProviderGroup {
  return {
    key: summary.key,
    provider: summary.provider,
    models: summary.models,
    usages: withUsageKeys(summary),
    calls: summary.calls,
    lastUsedAt: summary.lastUsedAt,
    pricingStatus: summary.pricingStatus,
    settlementAmount: summary.settlementAmount
  }
}

function withUsageKeys(summary: Pick<ModelUsageBreakdownSummary, 'usages'>): ModelUsageDisplayUsage[] {
  return summary.usages.map((usage) => ({
    ...usage,
    key: usageCategoryKey(usage.modality, usage.unit)
  }))
}

type ModelUsageDisplayUsage = {
  key: string
  modality: ModelUsageLedgerModality
  unit: ModelUsageMetric['unit']
  quantity: number
}

type ModelUsageInvocation = {
  key: string
  requestId: string
  recordedAt: Date
  provider: string
  model: string | null
  operation: IModelUsageLedger['operation']
  modality: ModelUsageLedgerModality
  usages: ModelUsageDisplayUsage[]
  pricingStatus: ModelUsagePricingStatus
  originalAmounts: Array<{ currency: string; amount: number }>
  settlementAmount: number | null
  settlementCurrency: string | null
  exchangeRates: number[]
}

export function groupUsageInvocations(items: IModelUsageLedger[]): ModelUsageInvocation[] {
  const invocations = new Map<string, ModelUsageInvocation>()
  for (const item of items) {
    const key = `${item.providerScopeId}:${item.requestId}`
    let invocation = invocations.get(key)
    if (!invocation) {
      invocation = {
        key,
        requestId: item.requestId,
        recordedAt: item.recordedAt,
        provider: item.provider,
        model: item.model ?? null,
        operation: item.operation,
        modality: item.modality,
        usages: [],
        pricingStatus: 'unpriced',
        originalAmounts: [],
        settlementAmount: null,
        settlementCurrency: null,
        exchangeRates: []
      }
      invocations.set(key, invocation)
    }

    const usageKey = usageCategoryKey(item.modality, item.unit)
    const quantity = Number(item.unit === 'token' ? item.totalTokens : item.quantity) || 0
    const usage = invocation.usages.find(({ key }) => key === usageKey)
    if (usage) usage.quantity += quantity
    else invocation.usages.push({ key: usageKey, modality: item.modality, unit: item.unit, quantity })

    const pricingStatus = item.charge?.pricingStatus ?? 'unpriced'
    if (pricingStatus === 'priced' || (pricingStatus === 'free' && invocation.pricingStatus === 'unpriced')) {
      invocation.pricingStatus = pricingStatus
    }

    const amount = item.charge?.amount
    if (amount !== null && amount !== undefined && item.charge?.currency) {
      addCurrencyAmount(invocation.originalAmounts, item.charge.currency, Number(amount) || 0)
    }

    const settlementAmount = item.charge?.settlementAmount
    if (settlementAmount !== null && settlementAmount !== undefined) {
      invocation.settlementAmount = (invocation.settlementAmount ?? 0) + (Number(settlementAmount) || 0)
      invocation.settlementCurrency = normalizeCurrency(item.charge?.settlementCurrency || 'CNY')
    }

    const exchangeRate = item.charge?.exchangeRate
    if (
      exchangeRate !== null &&
      exchangeRate !== undefined &&
      Number.isFinite(Number(exchangeRate)) &&
      !invocation.exchangeRates.includes(Number(exchangeRate))
    ) {
      invocation.exchangeRates.push(Number(exchangeRate))
    }
  }
  return [...invocations.values()]
}

type ModelUsageBreakdown = {
  key: string
  usages: ModelUsageDisplayUsage[]
  calls: number
  lastUsedAt: Date
  pricingStatus: ModelUsagePricingStatus
  settlementAmount: number
}

type ModelUsageModelGroup = ModelUsageBreakdown & {
  provider: string
  model: string | null
}

type ModelUsageProviderGroup = ModelUsageBreakdown & {
  provider: string
  models: string[]
}

function addCurrencyAmount(amounts: Array<{ currency: string; amount: number }>, currency: string, amount: number) {
  const normalizedCurrency = normalizeCurrency(currency)
  const current = amounts.find((item) => item.currency === normalizedCurrency)
  if (current) current.amount += amount
  else amounts.push({ currency: normalizedCurrency, amount })
}

function usageCategoryKey(modality: ModelUsageLedgerModality, unit: ModelUsageMetric['unit']) {
  return `${modality}:${unit}`
}

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase()
  return normalized === 'RMB' ? 'CNY' : normalized
}
