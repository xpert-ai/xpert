import { CommonModule } from '@angular/common'
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import {
  IMembershipUsageBucket,
  IMembershipUsageOverview,
  IUserMembershipPeriod,
  MembershipPeriodStatusEnum
} from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardProgressBarComponent,
  ZardTabsImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { forkJoin, map, take } from 'rxjs'
import {
  buildMembershipUsageHeatmap,
  getMembershipUsageHeatmapRange,
  MembershipUsageHeatmapCell
} from './usage-heatmap.utils'
import { buildMembershipUsageTrend } from './usage-trend.utils'

@Component({
  standalone: true,
  selector: 'xp-account-usage',
  imports: [
    CommonModule,
    TranslateModule,
    RouterLink,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
    ...ZardTooltipImports,
    ...ZardTabsImports,
    ...ZardCardImports
  ],
  templateUrl: './usage.component.html',
  styleUrls: ['./usage.component.scss']
})
export class XpAccountUsageComponent implements OnInit {
  readonly #membership = inject(MembershipService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #destroyRef = inject(DestroyRef)

  readonly overview = signal<IMembershipUsageOverview | null>(null)
  readonly periods = signal<IUserMembershipPeriod[]>([])
  readonly activityBuckets = signal<IMembershipUsageBucket[]>([])
  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly asOf = signal(new Date())
  readonly #language = toSignal(this.#translate.onLangChange.pipe(map(({ lang }) => lang)), {
    initialValue: this.#translate.currentLang || this.#translate.getDefaultLang() || 'en'
  })
  readonly heatmap = computed(() => buildMembershipUsageHeatmap(this.activityBuckets(), this.asOf(), this.#language()))
  readonly trend = computed(() =>
    buildMembershipUsageTrend(this.overview()?.buckets ?? [], this.asOf(), this.#language())
  )
  readonly totalPoints = computed(
    () => this.overview()?.buckets.reduce((total, bucket) => total + bucket.pointsUsed, 0) ?? 0
  )
  readonly peakDailyPoints = computed(
    () => this.overview()?.buckets.reduce((peak, bucket) => Math.max(peak, bucket.pointsUsed), 0) ?? 0
  )
  readonly topThreads = computed(() => this.overview()?.topThreads.slice(0, 5) ?? [])
  readonly scheduledPeriods = computed(() =>
    this.periods().filter(({ status }) => status === MembershipPeriodStatusEnum.Scheduled)
  )
  readonly rankings = computed(() => [
    { key: 'TopXperts', icon: 'orbit', items: this.overview()?.topXperts ?? [] },
    { key: 'TopModels', icon: 'sparkles', items: this.overview()?.topModels ?? [] },
    { key: 'TopThreads', icon: 'message-circle-more', items: this.topThreads() }
  ])

  ngOnInit() {
    this.load()
  }

  load() {
    if (this.loading()) return
    this.loading.set(true)
    this.loadFailed.set(false)
    this.asOf.set(new Date())
    const activityRange = getMembershipUsageHeatmapRange(this.asOf())
    forkJoin({
      overview: this.#membership.getOverview().pipe(take(1)),
      periods: this.#membership.getMyPeriods().pipe(take(1)),
      activity: this.#membership
        .getOverview({
          start: activityRange.start.toISOString(),
          end: activityRange.end.toISOString()
        })
        .pipe(take(1))
    })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: ({ overview, periods, activity }) => {
          this.overview.set(overview)
          this.periods.set(periods)
          this.activityBuckets.set(activity?.buckets ?? [])
          this.loading.set(false)
        },
        error: (error) => {
          this.loading.set(false)
          this.loadFailed.set(true)
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
    const pointsUsed = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bucket.pointsUsed)

    return this.#translate.instant('XP.Membership.HeatmapDailyPointsTitle', {
      date,
      pointsUsed,
      Default: `${date}: ${pointsUsed} points used`
    })
  }
}
