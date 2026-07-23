import { CommonModule } from '@angular/common'
import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import { IMembershipUsageBucket, IMembershipUsageOverview } from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardProgressBarComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { forkJoin, map } from 'rxjs'
import {
  buildMembershipUsageHeatmap,
  getMembershipUsageHeatmapRange,
  MembershipUsageHeatmapCell
} from './usage-heatmap.utils'

@Component({
  standalone: true,
  selector: 'pac-account-usage',
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
    ...ZardTooltipImports,
    ...ZardCardImports
  ],
  templateUrl: './usage.component.html',
  styleUrls: ['./usage.component.scss']
})
export class PACAccountUsageComponent implements OnInit {
  readonly #membership = inject(MembershipService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly overview = signal<IMembershipUsageOverview | null>(null)
  readonly activityBuckets = signal<IMembershipUsageBucket[]>([])
  readonly loading = signal(false)
  readonly #language = toSignal(this.#translate.onLangChange.pipe(map(({ lang }) => lang)), {
    initialValue: this.#translate.currentLang || this.#translate.getDefaultLang() || 'en'
  })
  readonly heatmap = computed(() => buildMembershipUsageHeatmap(this.activityBuckets(), new Date(), this.#language()))
  readonly totalPoints = computed(
    () => this.overview()?.buckets.reduce((total, bucket) => total + bucket.pointsUsed, 0) ?? 0
  )
  readonly peakDailyPoints = computed(
    () => this.overview()?.buckets.reduce((peak, bucket) => Math.max(peak, bucket.pointsUsed), 0) ?? 0
  )

  ngOnInit() {
    this.load()
  }

  load() {
    this.loading.set(true)
    const activityRange = getMembershipUsageHeatmapRange(new Date())
    forkJoin({
      overview: this.#membership.getOverview(),
      activity: this.#membership.getOverview({
        start: activityRange.start.toISOString(),
        end: activityRange.end.toISOString()
      })
    }).subscribe({
      next: ({ overview, activity }) => {
        this.overview.set(overview)
        this.activityBuckets.set(activity?.buckets ?? [])
        this.loading.set(false)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  usedPercent() {
    const overview = this.overview()
    if (!overview?.pointsGranted) {
      return 0
    }

    return Math.min(100, Math.round((overview.pointsUsed / overview.pointsGranted) * 100))
  }

  isUnlimited() {
    return this.overview()?.pointsGranted === null
  }

  heatmapTitle(bucket: MembershipUsageHeatmapCell) {
    const locale = this.#language()
    const date = new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric'
    }).format(bucket.dateValue)
    const tokenUsed = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(bucket.tokenUsed)

    return this.#translate.instant('PAC.Membership.HeatmapDailyTitle', {
      date,
      tokenUsed,
      Default: `${date}: ${tokenUsed} tokens used`
    })
  }
}
