import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { calcTimeRange, OverlayAnimations, TimeRangeEnum, TimeRangeOptions } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { injectApiBaseUrl, injectToastr, XpertService } from '../../../../../@core'
import { XpertComponent } from '../../xpert.component'
import { StatisticsChartComponent, StatisticsTokenUsageComponent } from 'apps/cloud/src/app/@shared/charts'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmI18nPipe,
    NgmSelectComponent,
    StatisticsChartComponent,
    StatisticsTokenUsageComponent
  ],
  selector: 'xpert-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: 'statistics.component.scss',
  animations: [...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStatisticsComponent {
  TimeRanges = TimeRangeOptions
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id)

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly selectedTimeOption = computed(() => TimeRangeOptions.find((_) => _.value === this.timeRangeValue())?.label)

  readonly dailyConv = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getDailyConversations(this.xpertId(), this.timeRange()) : of(null)
  })

  readonly dailyEndUsers = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getDailyEndUsers(this.xpertId(), this.timeRange()) : of(null)
  })

  readonly averageSessionInteractions = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getAverageSessionInteractions(this.xpertId(), this.timeRange()) : of(null)
  })

  readonly dailyMessages = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getDailyMessages(this.xpertId(), this.timeRange()) : of(null)
  })
  readonly tokensPerSecond = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getStatisticsTokensPerSecond(this.xpertId(), this.timeRange()) : of(null)
  })
  readonly userSatisfactionRate = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getStatisticsUserSatisfactionRate(this.xpertId(), this.timeRange()) : of(null)
  })
  readonly tokenCost = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getStatisticsTokenCost(this.xpertId(), this.timeRange()) : of(null)
  })
}
