import { CommonModule } from '@angular/common'
import { Component, OnInit, inject, signal } from '@angular/core'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import { IMembershipUsageBucket, IMembershipUsageOverview } from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardCardImports, ZardIconComponent, ZardProgressBarComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-account-usage',
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardIconComponent,
    ZardProgressBarComponent,
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
  readonly loading = signal(false)

  ngOnInit() {
    this.load()
  }

  load() {
    this.loading.set(true)
    this.#membership.getOverview().subscribe({
      next: (overview) => {
        this.overview.set(overview)
        this.loading.set(false)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  buckets() {
    return this.overview()?.buckets ?? []
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

  heatmapOpacity(bucket: IMembershipUsageBucket) {
    const max = Math.max(...this.buckets().map((item) => item.pointsUsed), 1)
    return bucket.pointsUsed ? Math.max(0.18, bucket.pointsUsed / max) : 0.08
  }

  heatmapTitle(bucket: IMembershipUsageBucket) {
    const points = this.#translate.instant('PAC.Membership.Points', { Default: 'points' })
    const tokens = this.#translate.instant('PAC.Membership.Tokens', { Default: 'tokens' })
    return `${bucket.date}: ${bucket.pointsUsed} ${points} / ${bucket.tokenUsed} ${tokens}`
  }
}
