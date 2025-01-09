import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { addDays, differenceInDays, startOfMonth, startOfQuarter, startOfYear, subDays, subSeconds } from 'date-fns'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { injectApiBaseUrl, injectToastr, XpertService } from '../../../../../@core'
import { XpertComponent } from '../../xpert.component'
import { XpertStatisticsChartComponent } from '../chart/chart.component'

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
    NgmSpinComponent,
    XpertStatisticsChartComponent,
    NgmSelectComponent
  ],
  selector: 'xpert-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: 'statistics.component.scss',
  animations: [...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStatisticsComponent {
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id)

  readonly selectedTime = model<number>(7)
  readonly timeRange = computed<[string, string]>(() => this.selectedTime() ? [
    subDays(new Date(), this.selectedTime() - 1)
      .toISOString()
      .slice(0, 10),
    subSeconds(addDays(new Date(new Date().toISOString().slice(0, 10)), 1), 1).toISOString()
  ] : [null, null])

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

  readonly today = new Date()
  readonly firstDayOfMonth = startOfMonth(this.today)
  readonly firstDayOfQuarter = startOfQuarter(this.today)
  readonly firstDayOfYear = startOfYear(this.today)
  readonly timeOptions = signal<TSelectOption[]>([
    {
      value: 1,
      label: {
        en_US: 'Today',
        zh_Hans: '今天'
      }
    },
    {
      value: 7,
      label: {
        en_US: 'Last 7 days',
        zh_Hans: '最近7天'
      }
    },
    {
      value: 28,
      label: {
        en_US: 'Last 4 weeks',
        zh_Hans: '最近4周'
      }
    },
    {
      value: 90,
      label: {
        en_US: 'Last 3 months',
        zh_Hans: '最近3个月'
      }
    },
    {
      value: differenceInDays(this.today, this.firstDayOfMonth),
      label: {
        en_US: 'Month to date',
        zh_Hans: '本月至今'
      }
    },
    {
      value: differenceInDays(this.today, this.firstDayOfQuarter),
      label: {
        en_US: 'Quarter to date',
        zh_Hans: '本季度至今'
      }
    },
    {
      value: differenceInDays(this.today, this.firstDayOfYear),
      label: {
        en_US: 'Year to date',
        zh_Hans: '本年至今'
      }
    },
    {
      value: null,
      label: {
        en_US: 'All time',
        zh_Hans: '所有时间'
      }
    }
  ])

  readonly selectedTimeOption = computed(
    () => this.timeOptions().find((option) => option.value === this.selectedTime())?.label
  )
}
