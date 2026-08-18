import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions, TSelectOption, XpI18nPipe } from '@xpert-ai/headless-ui'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { XpertAPIService } from '../../../../../@core'
import {
  StatisticsChartComponent,
  StatisticsPieChartComponent,
  StatisticsTokenUsageComponent
} from 'apps/cloud/src/app/@shared/charts'
import { XpSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { XpertComponent } from '../../xpert.component'

@Component({
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    XpI18nPipe,
    XpSelectComponent,
    StatisticsChartComponent,
    StatisticsPieChartComponent,
    StatisticsTokenUsageComponent
  ],
  selector: 'xp-xpert-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: 'statistics.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStatisticsComponent {
  readonly TimeRanges = TimeRangeOptions
  readonly xpertService = inject(XpertAPIService)
  readonly xpertComponent = inject(XpertComponent)

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly xpertLabel = computed(() => this.xpert()?.title || this.xpert()?.name || '')

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly selectedModel = model<string | null>(null)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly selectedTimeOption = computed(() => TimeRangeOptions.find((_) => _.value === this.timeRangeValue())?.label)
  readonly filters = computed(() => (this.selectedModel() ? { model: this.selectedModel() } : undefined))

  readonly usageOverview = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId ? this.xpertService.getUsageOverview(xpertId, this.timeRange(), this.filters()) : of(null)
  })
  readonly modelOptions = computed<TSelectOption<string>[]>(() => {
    const models = new Set(this.usageOverview()?.availableModels.map((item) => item.model) ?? [])
    return Array.from(models)
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({ value, label: value }))
  })
  readonly modelTokenUsage = computed(() =>
    (this.usageOverview()?.modelUsage ?? [])
      .map((item) => ({ date: this.modelLabel(item.provider, item.model), token: item.tokenUsed }))
      .sort((left, right) => right.token - left.token)
  )
  readonly modelPointUsage = computed(() =>
    (this.usageOverview()?.modelUsage ?? [])
      .map((item) => ({ date: this.modelLabel(item.provider, item.model), count: item.membershipPointsUsed }))
      .sort((left, right) => right.count - left.count)
  )
  readonly dailyCalls = computed(() =>
    (this.usageOverview()?.daily ?? []).map((item) => ({ date: item.date, count: item.callCount }))
  )
  readonly dailyUsageUsers = computed(() =>
    (this.usageOverview()?.daily ?? []).map((item) => ({ date: item.date, count: item.activeUsers }))
  )
  readonly dailyUsageConversations = computed(() =>
    (this.usageOverview()?.daily ?? []).map((item) => ({ date: item.date, count: item.conversationCount }))
  )

  readonly dailyMessages = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId ? this.xpertService.getDailyMessages(xpertId, this.timeRange(), this.filters()) : of(null)
  })
  readonly tokensPerSecond = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId
      ? this.xpertService.getStatisticsTokensPerSecond(xpertId, this.timeRange(), this.filters())
      : of(null)
  })
  readonly userSatisfactionRate = derivedAsync(() => {
    const xpertId = this.xpertId()
    return xpertId
      ? this.xpertService.getStatisticsUserSatisfactionRate(xpertId, this.timeRange(), this.filters())
      : of(null)
  })

  constructor() {
    effect(() => {
      const selectedModel = this.selectedModel()
      if (selectedModel && !this.modelOptions().some((option) => option.value === selectedModel)) {
        this.selectedModel.set(null)
      }
    })
  }

  private modelLabel(provider?: string | null, model?: string | null) {
    return [provider, model].filter(Boolean).join(' / ') || 'Unknown model'
  }
}
