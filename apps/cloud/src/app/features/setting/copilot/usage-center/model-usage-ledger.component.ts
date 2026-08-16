import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IModelUsageLedger,
  ModelUsageLedgerModality,
  ModelUsageLedgerQuery,
  ModelUsageLedgerTotals,
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
  ZardTableImports
} from '@xpert-ai/headless-ui'
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
    WaIntersectionObserver,
    XpSelectComponent,
    XpSpinComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
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
  readonly categoryFilter = model<ModelUsageCategory | ''>('')
  readonly pricingStatusFilter = model<ModelUsagePricingStatus | ''>('')

  readonly items = signal<IModelUsageLedger[]>([])
  readonly totals = signal<ModelUsageLedgerTotals[]>([])
  readonly expandedAccountKeys = signal<Set<string>>(new Set())
  readonly loading = signal(false)
  readonly totalsLoading = signal(false)
  readonly currentPage = signal(0)
  readonly done = signal(false)
  readonly pageSize = 30

  readonly timeRanges = computed(() => {
    this.languageChange()
    return TimeRangeOptions.map((option) => ({
      value: option.value,
      label: this.translate.instant(`XP.TimeRange.${option.value}`, {
        Default: typeof option.label === 'string' ? option.label : option.label.en_US
      })
    }))
  })
  readonly categories = computed(() => {
    this.languageChange()
    return [
      { value: '', label: this.translate.instant('XP.Copilot.AllUnits', { Default: 'All units' }) },
      { value: 'llm_token', label: this.translate.instant('XP.Copilot.LlmToken', { Default: 'LLM Token' }) },
      { value: 'image_token', label: this.translate.instant('XP.Copilot.ImageToken', { Default: 'Image Token' }) },
      {
        value: 'image_generation',
        label: this.translate.instant('XP.Copilot.ImageGeneration', { Default: 'Image generation' })
      },
      { value: 'video_token', label: this.translate.instant('XP.Copilot.VideoToken', { Default: 'Video Token' }) },
      {
        value: 'video_generation',
        label: this.translate.instant('XP.Copilot.VideoGeneration', { Default: 'Video generation' })
      },
      {
        value: 'video_second',
        label: this.translate.instant('XP.Copilot.VideoSecond', { Default: 'Video seconds' })
      }
    ] as Array<{ value: ModelUsageCategory | ''; label: string }>
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
  readonly summaryCards = computed(() => summarizeTotals(this.totals()))
  readonly accountGroups = computed(() => groupUsageByAccount(this.items()))

  constructor() {
    effect(
      () => {
        this.activeScope()
        if (!this.isTenantScope() && untracked(() => this.organizationFilter())) this.organizationFilter.set('')
        untracked(() => this.reload())
      },
      { allowSignalWrites: true }
    )
  }

  reload() {
    const version = ++this.#loadVersion
    this.currentPage.set(0)
    this.done.set(false)
    this.items.set([])
    this.expandedAccountKeys.set(new Set())
    this.loading.set(false)
    this.loadTotals(version)
    this.loadMore(version)
  }

  loadTotals(version = this.#loadVersion) {
    this.totalsLoading.set(true)
    this.usageService.getModelUsageLedgerTotals(this.query()).subscribe({
      next: (totals) => {
        if (version !== this.#loadVersion) return
        this.totals.set(totals)
        this.totalsLoading.set(false)
      },
      error: (error) => this.handleError(error, version, true)
    })
  }

  loadMore(version = this.#loadVersion) {
    if (this.loading() || this.done()) return
    this.loading.set(true)
    this.usageService
      .getModelUsageLedger({
        ...this.query(),
        take: this.pageSize,
        skip: this.currentPage() * this.pageSize
      })
      .subscribe({
        next: ({ items, total }) => {
          if (version !== this.#loadVersion) return
          this.items.update((state) => [...state, ...items])
          this.currentPage.update((page) => page + 1)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) this.done.set(true)
          this.loading.set(false)
        },
        error: (error) => this.handleError(error, version, false)
      })
  }

  rowUsage(item: IModelUsageLedger) {
    return item.unit === 'token' ? item.totalTokens : item.quantity
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
    return this.translate.instant('XP.Copilot.Token', { Default: 'Token' })
  }

  currencyLabel(currency: string | null | undefined) {
    return currency ? normalizeCurrency(currency) : ''
  }

  categoryLabel(category: ModelUsageCategory) {
    switch (category) {
      case 'llm_token':
        return this.translate.instant('XP.Copilot.LlmToken', { Default: 'LLM Token' })
      case 'image_token':
        return this.translate.instant('XP.Copilot.ImageToken', { Default: 'Image Token' })
      case 'image_generation':
        return this.translate.instant('XP.Copilot.ImageGeneration', { Default: 'Image generation' })
      case 'video_token':
        return this.translate.instant('XP.Copilot.VideoToken', { Default: 'Video Token' })
      case 'video_generation':
        return this.translate.instant('XP.Copilot.VideoGeneration', { Default: 'Video generation' })
      case 'video_second':
        return this.translate.instant('XP.Copilot.VideoSecond', { Default: 'Video seconds' })
    }
  }

  isAccountExpanded(group: ModelUsageAccountGroup) {
    return this.expandedAccountKeys().has(group.key)
  }

  toggleAccount(group: ModelUsageAccountGroup) {
    this.expandedAccountKeys.update((state) => {
      const next = new Set(state)
      if (next.has(group.key)) next.delete(group.key)
      else next.add(group.key)
      return next
    })
  }

  private query(): ModelUsageLedgerQuery {
    const [start, end] = calcTimeRange(this.timeRangeValue())
    const category = usageCategoryQuery(this.categoryFilter())
    return {
      start,
      end,
      unit: category?.unit,
      provider: clean(this.providerFilter()),
      model: clean(this.modelFilter()),
      userId: clean(this.userFilter()),
      organizationId: this.isTenantScope() ? clean(this.organizationFilter()) : this.currentOrganizationId(),
      currency: clean(this.currencyFilter()),
      modality: category?.modality,
      pricingStatus: this.pricingStatusFilter() || undefined
    }
  }

  private handleError(error: unknown, version: number, totals: boolean) {
    if (version !== this.#loadVersion) return
    if (totals) this.totalsLoading.set(false)
    else this.loading.set(false)
    this.toastr.error(error, this.translate.instant('XP.KEY_WORDS.Error', { Default: 'Error' }))
  }
}

function clean(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || undefined
}

type ModelUsageAccountGroup = {
  key: string
  userId: string | null
  userName: string | null
  items: IModelUsageLedger[]
  lastUsedAt: Date
  usages: Array<{ category: ModelUsageCategory; unit: ModelUsageMetric['unit']; quantity: number }>
  pricedAmounts: {
    llm: number
    video: number
    total: number
  }
}

function groupUsageByAccount(items: IModelUsageLedger[]): ModelUsageAccountGroup[] {
  const groups = new Map<string, ModelUsageAccountGroup>()
  for (const item of items) {
    const userId = clean(item.userId) ?? null
    const key = userId ?? '__unknown_account__'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        userId,
        userName: clean(item.userName) ?? null,
        items: [],
        lastUsedAt: item.recordedAt,
        usages: [],
        pricedAmounts: { llm: 0, video: 0, total: 0 }
      }
      groups.set(key, group)
    }
    group.items.push(item)
    if (!group.userName && item.userName) group.userName = item.userName
    if (new Date(item.recordedAt).getTime() > new Date(group.lastUsedAt).getTime()) {
      group.lastUsedAt = item.recordedAt
    }

    const category = resolveUsageCategory(item.modality, item.unit)
    if (category) {
      const usage = group.usages.find((item) => item.category === category)
      const quantity = Number(item.unit === 'token' ? item.totalTokens : item.quantity) || 0
      if (usage) usage.quantity += quantity
      else group.usages.push({ category, unit: item.unit, quantity })
    }

    const settlementAmount = item.charge?.settlementAmount
    if (
      item.charge?.pricingStatus === 'priced' &&
      settlementAmount !== null &&
      settlementAmount !== undefined &&
      Number.isFinite(Number(settlementAmount))
    ) {
      const amount = Number(settlementAmount)
      group.pricedAmounts.total += amount
      if (item.modality === 'text') group.pricedAmounts.llm += amount
      if (item.modality === 'video') group.pricedAmounts.video += amount
    }
  }
  return [...groups.values()]
}

type ModelUsageCategory =
  | 'llm_token'
  | 'image_token'
  | 'image_generation'
  | 'video_token'
  | 'video_generation'
  | 'video_second'

type ModelUsageSummaryCard = {
  category: ModelUsageCategory
  unit: ModelUsageMetric['unit']
  usage: number
  records: number
  pricingStatuses: Array<{ status: ModelUsagePricingStatus; records: number }>
  originalAmounts: Array<{ currency: string; amount: number }>
  settlementAmount: number | null
  settlementCurrency: string | null
}

const CATEGORY_QUERIES: Record<
  ModelUsageCategory,
  { unit: ModelUsageMetric['unit']; modality: ModelUsageLedgerModality }
> = {
  llm_token: { unit: 'token', modality: 'text' },
  image_token: { unit: 'token', modality: 'image' },
  image_generation: { unit: 'generation', modality: 'image' },
  video_token: { unit: 'token', modality: 'video' },
  video_generation: { unit: 'generation', modality: 'video' },
  video_second: { unit: 'second', modality: 'video' }
}

function usageCategoryQuery(category: ModelUsageCategory | '') {
  return category ? CATEGORY_QUERIES[category] : undefined
}

function summarizeTotals(totals: ModelUsageLedgerTotals[]): ModelUsageSummaryCard[] {
  const cards = new Map<ModelUsageCategory, ModelUsageSummaryCard>()
  for (const total of totals) {
    const category = resolveUsageCategory(total.modality, total.unit)
    if (!category) continue
    let card = cards.get(category)
    if (!card) {
      card = {
        category,
        unit: total.unit,
        usage: 0,
        records: 0,
        pricingStatuses: [],
        originalAmounts: [],
        settlementAmount: null,
        settlementCurrency: null
      }
      cards.set(category, card)
    }
    card.usage += Number(total.unit === 'token' ? total.totalTokens : total.quantity) || 0
    card.records += Number(total.records) || 0

    const pricing = card.pricingStatuses.find(({ status }) => status === total.pricingStatus)
    if (pricing) pricing.records += Number(total.records) || 0
    else card.pricingStatuses.push({ status: total.pricingStatus, records: Number(total.records) || 0 })

    if (total.amount !== null && total.amount !== undefined && total.currency) {
      const currency = normalizeCurrency(total.currency)
      const original = card.originalAmounts.find((amount) => amount.currency === currency)
      if (original) original.amount += Number(total.amount) || 0
      else card.originalAmounts.push({ currency, amount: Number(total.amount) || 0 })
    }

    if (total.settlementAmount !== null && total.settlementAmount !== undefined) {
      card.settlementAmount = (card.settlementAmount ?? 0) + (Number(total.settlementAmount) || 0)
      card.settlementCurrency = normalizeCurrency(total.settlementCurrency || 'CNY')
    }
  }
  return [...cards.values()]
}

function resolveUsageCategory(
  modality: ModelUsageLedgerModality,
  unit: ModelUsageMetric['unit']
): ModelUsageCategory | null {
  for (const [category, query] of Object.entries(CATEGORY_QUERIES) as Array<
    [ModelUsageCategory, (typeof CATEGORY_QUERIES)[ModelUsageCategory]]
  >) {
    if (query.modality === modality && query.unit === unit) return category
  }
  return null
}

function normalizeCurrency(currency: string) {
  const normalized = currency.trim().toUpperCase()
  return normalized === 'RMB' ? 'CNY' : normalized
}
