import { ExecutionUsageComponent } from './execution-usage.component'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import {
  IMembershipMe,
  IMembershipPointLedger,
  IMembershipUsageQuery,
  IMembershipUsageSummary,
  ModelGatewayUsageChannelEnum
} from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardProgressBarComponent,
  ZardTableImports,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { forkJoin, take } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-account-billing',
  imports: [
    ExecutionUsageComponent,
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
    ...ZardCardImports,
    ...ZardTableImports,
    ...ZardTabsImports
  ],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss']
})
export class XpAccountBillingComponent implements OnInit {
  readonly #membership = inject(MembershipService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)
  #loadVersion = 0

  readonly me = signal<IMembershipMe | null>(null)
  readonly usageSummaries = signal<IMembershipUsageSummary[]>([])
  readonly expandedSummaryKey = signal<string | null>(null)
  readonly summaryDetails = signal<Record<string, IMembershipPointLedger[]>>({})
  readonly summaryDetailsLoading = signal<Record<string, boolean>>({})
  readonly summaryDetailsFailed = signal<Record<string, boolean>>({})
  readonly loading = signal(false)
  readonly loadFailed = signal(false)

  ngOnInit() {
    this.load()
  }

  load() {
    if (this.loading()) return
    this.#loadVersion++
    this.loading.set(true)
    this.loadFailed.set(false)
    this.expandedSummaryKey.set(null)
    this.summaryDetails.set({})
    this.summaryDetailsLoading.set({})
    this.summaryDetailsFailed.set({})
    forkJoin({
      me: this.#membership.getMe().pipe(take(1)),
      summaries: this.#membership.getMyUsageSummary({ take: 20 }).pipe(take(1))
    })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: ({ me, summaries }) => {
          this.me.set(me)
          this.usageSummaries.set(summaries.items ?? [])
          this.loading.set(false)
        },
        error: (error) => this.handleError(error)
      })
  }

  usedPercent() {
    const me = this.me()
    if (!me?.pointsGranted) {
      return 0
    }
    return Math.min(100, Math.round((me.pointsUsed / me.pointsGranted) * 100))
  }

  isUnlimited() {
    return this.me()?.pointsGranted === null
  }

  summaryKey(summary: IMembershipUsageSummary) {
    return [
      summary.usageHour ?? '',
      summary.usageChannel ?? '',
      summary.organizationId ?? '',
      summary.xpertId ?? '',
      summary.threadId ?? '',
      summary.copilotId ?? '',
      summary.provider ?? '',
      summary.model ?? ''
    ].join('|')
  }

  isExpanded(summary: IMembershipUsageSummary) {
    return this.expandedSummaryKey() === this.summaryKey(summary)
  }

  toggleSummary(summary: IMembershipUsageSummary) {
    const key = this.summaryKey(summary)
    if (this.expandedSummaryKey() === key) {
      this.expandedSummaryKey.set(null)
      return
    }

    this.expandedSummaryKey.set(key)
    this.loadSummaryDetails(summary)
  }

  loadSummaryDetails(summary: IMembershipUsageSummary) {
    const key = this.summaryKey(summary)
    if (this.summaryDetails()[key] || this.summaryDetailsLoading()[key]) return
    const version = this.#loadVersion

    this.summaryDetailsLoading.update((value) => ({ ...value, [key]: true }))
    this.summaryDetailsFailed.update((value) => ({ ...value, [key]: false }))
    this.#membership
      .getMyDetails(this.toDetailsQuery(summary))
      .pipe(take(1), takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (result) => {
          if (version !== this.#loadVersion) return
          this.summaryDetails.update((value) => ({ ...value, [key]: result.items ?? [] }))
          this.summaryDetailsLoading.update((value) => ({ ...value, [key]: false }))
        },
        error: (error) => {
          if (version !== this.#loadVersion) return
          this.summaryDetailsLoading.update((value) => ({ ...value, [key]: false }))
          this.summaryDetailsFailed.update((value) => ({ ...value, [key]: true }))
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  getSummaryDetails(summary: IMembershipUsageSummary) {
    return this.summaryDetails()[this.summaryKey(summary)] ?? []
  }

  isSummaryDetailsLoading(summary: IMembershipUsageSummary) {
    return this.summaryDetailsLoading()[this.summaryKey(summary)] ?? false
  }

  shortId(value?: string | null) {
    return value ? value.slice(0, 8) : '-'
  }

  conversationLabel(summary: IMembershipUsageSummary) {
    return this.trimmed(summary.conversationTitle) || this.shortId(summary.threadId)
  }

  xpertLabel(summary: IMembershipUsageSummary) {
    return this.trimmed(summary.xpertTitle) || this.trimmed(summary.xpertName) || this.shortId(summary.xpertId)
  }

  isExternalApi(summary: IMembershipUsageSummary) {
    return summary.usageChannel === ModelGatewayUsageChannelEnum.ExternalApi
  }

  private trimmed(value?: string | null) {
    return value?.trim() || null
  }

  private toDetailsQuery(summary: IMembershipUsageSummary): IMembershipUsageQuery {
    return {
      usageHour: summary.usageHour ?? undefined,
      usageChannel: summary.usageChannel ?? undefined,
      provider: summary.provider ?? undefined,
      model: summary.model ?? undefined,
      organizationId: summary.organizationId ?? undefined,
      xpertId: summary.xpertId ?? undefined,
      threadId: summary.threadId ?? undefined,
      copilotId: summary.copilotId ?? undefined
    }
  }

  private handleError(error: unknown) {
    this.loading.set(false)
    this.loadFailed.set(true)
    this.#toastr.error(getErrorMessage(error))
  }
}
