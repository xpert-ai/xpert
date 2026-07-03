import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@xpert-ai/core'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { startWith } from 'rxjs/operators'
import { OrgAvatarComponent } from 'apps/cloud/src/app/@shared/organization'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import {
  CopilotUsageService,
  DateRelativePipe,
  ICopilotUsageSummary,
  ICopilotUsageTotals,
  OrderTypeEnum,
  RequestScopeLevel,
  Store,
  TCopilotQuotaAdjustmentMode,
  TCopilotUsageDimension,
  ToastrService
} from '../../../../@core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'

type QuotaAction = TCopilotQuotaAdjustmentMode | 'renew'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot-usage-center',
  templateUrl: './usage-center.component.html',
  styleUrls: ['./usage-center.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    WaIntersectionObserver,
    NgmSelectComponent,
    NgmSpinComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardTooltipImports,
    ...ZardTableImports,
    OrgAvatarComponent,
    UserProfileInlineComponent,
    DateRelativePipe
  ]
})
export class CopilotUsageCenterComponent {
  readonly usageService = inject(CopilotUsageService)
  readonly toastr = inject(ToastrService)
  readonly translate = inject(TranslateService)
  readonly #store = inject(Store)
  #loadVersion = 0

  readonly languageChange = toSignal(this.translate.onLangChange.pipe(startWith(null)))
  readonly dimensions = computed(() => {
    this.languageChange()

    return [
      { value: 'user', label: this.translate.instant('PAC.Copilot.Creator', { Default: 'Creator' }) },
      {
        value: 'organization',
        label: this.translate.instant('PAC.KEY_WORDS.Organization', { Default: 'Organization' })
      },
      { value: 'model', label: this.translate.instant('PAC.Copilot.Model', { Default: 'Model' }) }
    ] as Array<{ value: TCopilotUsageDimension; label: string }>
  })
  readonly timeRanges = computed(() => {
    this.languageChange()

    return TimeRangeOptions.map((option) => ({
      value: option.value,
      label: this.translateTimeRange(option.value, option.label)
    }))
  })
  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly selectedOrganization = toSignal(this.#store.selectedOrganization$)

  readonly dimension = model<TCopilotUsageDimension>('user')
  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly providerFilter = model('')
  readonly modelFilter = model('')
  readonly userFilter = model('')
  readonly organizationFilter = model('')
  readonly currencyFilter = model('')

  readonly summaries = signal<ICopilotUsageSummary[]>([])
  readonly totals = signal<ICopilotUsageTotals[]>([])
  readonly expandedIds = signal<Set<string>>(new Set())
  readonly detailLoadingIds = signal<Set<string>>(new Set())

  readonly loading = signal(false)
  readonly totalsLoading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly quotaItem = signal<ICopilotUsageSummary | null>(null)
  readonly quotaAction = signal<QuotaAction>('set')
  readonly quotaTokenLimit = model<number | null>(null)
  readonly quotaPriceLimit = model<number | null>(null)
  readonly quotaSaving = signal(false)

  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly isOrganizationScope = computed(() => this.activeScope().level === RequestScopeLevel.ORGANIZATION)
  readonly currentOrganizationId = computed(() => {
    const scope = this.activeScope()
    return scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : undefined
  })
  readonly scopeName = computed(() => {
    this.languageChange()

    return this.isTenantScope()
      ? this.translate.instant('PAC.Scope.TenantEyebrow', { Default: 'Tenant Console' })
      : this.selectedOrganization()?.name ||
          this.translate.instant('PAC.Scope.OrganizationEyebrow', { Default: 'Organization Scope' })
  })
  readonly showOrganizationFilter = this.isTenantScope
  readonly canLoadMore = computed(() => !this.loading() && !this.done())
  readonly userFilterPlaceholder = computed(() => {
    this.languageChange()

    return this.dimension() === 'user'
      ? this.translate.instant('PAC.Copilot.CreatorUserId', { Default: 'Creator User ID' })
      : this.translate.instant('PAC.Copilot.UserId', { Default: 'User ID' })
  })
  readonly quotaTitle = computed(() => {
    this.languageChange()

    const action = this.quotaAction()
    if (action === 'increase') {
      return this.translate.instant('PAC.Copilot.IncreaseQuota', { Default: 'Increase quota' })
    }
    if (action === 'renew') {
      return this.translate.instant('PAC.Copilot.RenewQuota', { Default: 'Renew quota' })
    }
    return this.translate.instant('PAC.Copilot.SetQuota', { Default: 'Set quota' })
  })

  constructor() {
    effect(
      () => {
        this.activeScope()

        if (this.isOrganizationScope() && untracked(() => this.organizationFilter())) {
          this.organizationFilter.set('')
        }

        untracked(() => this.reload())
      },
      { allowSignalWrites: true }
    )
  }

  reload() {
    const version = ++this.#loadVersion
    this.currentPage.set(0)
    this.done.set(false)
    this.loading.set(false)
    this.totalsLoading.set(false)
    this.summaries.set([])
    this.expandedIds.set(new Set())
    this.detailLoadingIds.set(new Set())
    this.loadTotals(version)
    this.loadMore(version)
  }

  loadTotals(version = this.#loadVersion) {
    this.totalsLoading.set(true)
    this.usageService.getUsageTotals(this.query()).subscribe({
      next: (totals) => {
        if (version !== this.#loadVersion) {
          return
        }
        this.totals.set(totals)
        this.totalsLoading.set(false)
      },
      error: (error) => {
        if (version !== this.#loadVersion) {
          return
        }
        this.totalsLoading.set(false)
        this.toastr.error(error, this.errorTitle())
      }
    })
  }

  loadMore(version = this.#loadVersion) {
    if (this.loading() || this.done()) {
      return
    }

    this.loading.set(true)
    this.usageService
      .getUsageSummaries({
        ...this.query(),
        order: { updatedAt: OrderTypeEnum.DESC },
        take: this.pageSize,
        skip: this.currentPage() * this.pageSize
      })
      .subscribe({
        next: ({ items, total }) => {
          if (version !== this.#loadVersion) {
            return
          }
          this.summaries.update((state) => [...state, ...items])
          this.currentPage.update((state) => state + 1)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= (total ?? 0)) {
            this.done.set(true)
          }
          this.loading.set(false)
        },
        error: (error) => {
          if (version !== this.#loadVersion) {
            return
          }
          this.loading.set(false)
          this.toastr.error(error, this.errorTitle())
        }
      })
  }

  onIntersection() {
    if (this.canLoadMore()) {
      this.loadMore()
    }
  }

  toggleDetails(item: ICopilotUsageSummary) {
    const id = this.usageId(item)
    const shouldExpand = !this.expandedIds().has(id)
    this.expandedIds.update((state) => {
      const next = new Set(state)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

    if (shouldExpand && item.details === undefined) {
      this.loadDetails(item)
    }
  }

  loadDetails(item: ICopilotUsageSummary) {
    const id = this.usageId(item)
    this.setDetailLoading(id, true)
    this.usageService.getUsageDetails(item.groupKey).subscribe({
      next: (details) => {
        this.summaries.update((records) =>
          records.map((record) => (this.usageId(record) === id ? { ...record, details } : record))
        )
        this.setDetailLoading(id, false)
      },
      error: (error) => {
        this.setDetailLoading(id, false)
        this.toastr.error(error, this.errorTitle())
      }
    })
  }

  isExpanded(item: ICopilotUsageSummary) {
    return this.expandedIds().has(this.usageId(item))
  }

  isLoadingDetails(item: ICopilotUsageSummary) {
    return this.detailLoadingIds().has(this.usageId(item))
  }

  openQuota(item: ICopilotUsageSummary, action: QuotaAction) {
    this.quotaItem.set(item)
    this.quotaAction.set(action)
    this.quotaTokenLimit.set(action === 'increase' ? null : (item.tokenLimit ?? null))
    this.quotaPriceLimit.set(action === 'increase' ? null : (item.priceLimit ?? null))
  }

  closeQuota() {
    if (this.quotaSaving()) {
      return
    }
    this.quotaItem.set(null)
    this.quotaTokenLimit.set(null)
    this.quotaPriceLimit.set(null)
  }

  saveQuota() {
    const item = this.quotaItem()
    if (!item || item.dimension !== 'organization') {
      return
    }

    const action = this.quotaAction()
    const tokenLimit = action === 'increase' && this.quotaTokenLimit() === null ? undefined : this.quotaTokenLimit()
    const priceLimit = action === 'increase' && this.quotaPriceLimit() === null ? undefined : this.quotaPriceLimit()

    this.quotaSaving.set(true)
    const request =
      action === 'renew'
        ? this.usageService.renewQuota({
            dimension: item.dimension,
            groupKey: item.groupKey,
            tokenLimit,
            priceLimit
          })
        : this.usageService.adjustQuota({
            dimension: item.dimension,
            groupKey: item.groupKey,
            mode: action as TCopilotQuotaAdjustmentMode,
            tokenLimit,
            priceLimit
          })

    request.subscribe({
      next: () => {
        this.quotaSaving.set(false)
        this.closeQuota()
        this.reload()
      },
      error: (error) => {
        this.quotaSaving.set(false)
        this.toastr.error(error, this.errorTitle())
      }
    })
  }

  setQuotaTokenLimit(value: string | number | null) {
    this.quotaTokenLimit.set(toNullableNumber(value))
  }

  setQuotaPriceLimit(value: string | number | null) {
    this.quotaPriceLimit.set(toNullableNumber(value))
  }

  canManageQuota(item: ICopilotUsageSummary) {
    return item.dimension === 'organization'
  }

  usageId(item: ICopilotUsageSummary) {
    return String(item.id)
  }

  private setDetailLoading(id: string, loading: boolean) {
    this.detailLoadingIds.update((state) => {
      const next = new Set(state)
      if (loading) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  private query() {
    const [start, end] = this.timeRange()
    const organizationId = this.isOrganizationScope()
      ? this.currentOrganizationId()
      : cleanFilter(this.organizationFilter())

    return {
      dimension: this.dimension(),
      start,
      end,
      provider: cleanFilter(this.providerFilter()),
      model: cleanFilter(this.modelFilter()),
      userId: cleanFilter(this.userFilter()),
      organizationId,
      currency: cleanFilter(this.currencyFilter())
    }
  }

  private translateTimeRange(value: TimeRangeEnum, fallback: string | Record<string, string>) {
    const defaultLabel = typeof fallback === 'string' ? fallback : fallback.en_US || String(value)
    return this.translate.instant(`PAC.TimeRange.${value}`, { Default: defaultLabel })
  }

  private errorTitle() {
    return this.translate.instant('PAC.KEY_WORDS.Error', { Default: 'Error' })
  }
}

function cleanFilter(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function toNullableNumber(value: string | number | null) {
  if (value === null || value === '') {
    return null
  }
  return Number(value)
}
