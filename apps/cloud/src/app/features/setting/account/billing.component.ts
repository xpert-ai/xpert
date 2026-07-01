import { CommonModule } from '@angular/common'
import { Component, OnInit, inject, signal } from '@angular/core'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import {
  IMembershipMe,
  IMembershipPointLedger,
  IMembershipUsageQuery,
  IMembershipUsageSummary
} from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardProgressBarComponent
} from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-account-billing',
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
    ...ZardCardImports
  ],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss']
})
export class PACAccountBillingComponent implements OnInit {
  readonly #membership = inject(MembershipService)
  readonly #toastr = injectToastr()

  readonly me = signal<IMembershipMe | null>(null)
  readonly usageSummaries = signal<IMembershipUsageSummary[]>([])
  readonly expandedSummaryKey = signal<string | null>(null)
  readonly summaryDetails = signal<Record<string, IMembershipPointLedger[]>>({})
  readonly summaryDetailsLoading = signal<Record<string, boolean>>({})
  readonly loading = signal(false)

  ngOnInit() {
    this.load()
  }

  load() {
    this.loading.set(true)
    this.#membership.getMe().subscribe({
      next: (me) => {
        this.me.set(me)
        this.#membership.getMyUsageSummary({ take: 20 }).subscribe({
          next: (result) => {
            this.usageSummaries.set(result.items ?? [])
            this.loading.set(false)
          },
          error: (error) => this.handleError(error)
        })
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

  remainingPercent() {
    return Math.max(0, 100 - this.usedPercent())
  }

  summaryKey(summary: IMembershipUsageSummary) {
    return [
      summary.usageHour ?? '',
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
    if (this.summaryDetails()[key]) {
      return
    }

    this.summaryDetailsLoading.update((value) => ({ ...value, [key]: true }))
    this.#membership.getMyDetails(this.toDetailsQuery(summary)).subscribe({
      next: (result) => {
        this.summaryDetails.update((value) => ({ ...value, [key]: result.items ?? [] }))
        this.summaryDetailsLoading.update((value) => ({ ...value, [key]: false }))
      },
      error: (error) => {
        this.summaryDetailsLoading.update((value) => ({ ...value, [key]: false }))
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

  private toDetailsQuery(summary: IMembershipUsageSummary): IMembershipUsageQuery {
    return {
      usageHour: summary.usageHour ?? undefined,
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
    this.#toastr.error(getErrorMessage(error))
  }
}
