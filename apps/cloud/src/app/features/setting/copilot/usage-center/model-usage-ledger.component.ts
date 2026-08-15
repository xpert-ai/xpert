import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IModelUsageLedger,
  ModelInvocationModality,
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
  readonly unit = input.required<ModelUsageMetric['unit']>()
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
  readonly modalityFilter = model<ModelInvocationModality | ''>('')
  readonly pricingStatusFilter = model<ModelUsagePricingStatus | ''>('')

  readonly items = signal<IModelUsageLedger[]>([])
  readonly totals = signal<ModelUsageLedgerTotals[]>([])
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
  readonly modalities = computed(() => {
    this.languageChange()
    return [
      { value: '', label: this.translate.instant('XP.KEY_WORDS.All', { Default: 'All modalities' }) },
      { value: 'image', label: this.translate.instant('XP.KEY_WORDS.Image', { Default: 'Image' }) },
      { value: 'video', label: this.translate.instant('XP.KEY_WORDS.Video', { Default: 'Video' }) }
    ] as Array<{ value: ModelInvocationModality | ''; label: string }>
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

  constructor() {
    effect(
      () => {
        this.unit()
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

  usage(total: ModelUsageLedgerTotals) {
    return total.unit === 'token' ? total.totalTokens : total.quantity
  }

  rowUsage(item: IModelUsageLedger) {
    return item.unit === 'token' ? item.totalTokens : item.quantity
  }

  pricingLabel(status: ModelUsagePricingStatus) {
    if (status === 'free') return this.translate.instant('XP.Copilot.Free', { Default: 'Free' })
    if (status === 'unpriced') return this.translate.instant('XP.Copilot.Unpriced', { Default: 'Unpriced' })
    return this.translate.instant('XP.Copilot.Priced', { Default: 'Priced' })
  }

  private query(): ModelUsageLedgerQuery {
    const [start, end] = calcTimeRange(this.timeRangeValue())
    return {
      start,
      end,
      unit: this.unit(),
      provider: clean(this.providerFilter()),
      model: clean(this.modelFilter()),
      userId: clean(this.userFilter()),
      organizationId: this.isTenantScope() ? clean(this.organizationFilter()) : this.currentOrganizationId(),
      currency: clean(this.currencyFilter()),
      modality: this.modalityFilter() || undefined,
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
