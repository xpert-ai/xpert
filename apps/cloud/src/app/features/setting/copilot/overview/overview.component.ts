import { DecimalPipe } from '@angular/common'
import { Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { UsersService } from '@cloud/app/@core/state'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@xpert-ai/headless-ui'
import { XpI18nPipe, TSelectOption } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotUsageService, IUser, XpertAPIService } from 'apps/cloud/src/app/@core'
import {
  StatisticsChartComponent,
  StatisticsPieChartComponent,
  StatisticsTokenUsageComponent
} from 'apps/cloud/src/app/@shared/charts'
import { XpSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { derivedAsync } from 'ngxtension/derived-async'
import { map } from 'rxjs'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'xp-settings-copilot-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
  imports: [
    DecimalPipe,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ...ZardTooltipImports,
    XpI18nPipe,
    XpSelectComponent,
    StatisticsChartComponent,
    StatisticsPieChartComponent,
    StatisticsTokenUsageComponent
  ]
})
export class CopilotOverviewComponent {
  TimeRanges = TimeRangeOptions

  readonly usageService = inject(CopilotUsageService)
  readonly xpertService = inject(XpertAPIService)
  readonly userService = inject(UsersService)

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly selectedModel = model<string | null>(null)
  readonly selectedUserId = model<string | null>(null)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly selectedTimeOption = computed(() => TimeRangeOptions.find((_) => _.value === this.timeRangeValue())?.label)
  readonly usageQuery = computed(() => ({
    start: this.timeRange()[0],
    end: this.timeRange()[1],
    ...(this.selectedModel() ? { model: this.selectedModel() } : {}),
    ...(this.selectedUserId() ? { userId: this.selectedUserId() } : {})
  }))
  readonly usageOverview = derivedAsync(() => this.usageService.getUsageOverview(this.usageQuery()))
  readonly modelOptions = computed<TSelectOption<string>[]>(() => {
    const models = new Set(this.usageOverview()?.availableModels.map((item) => item.model) ?? [])
    return Array.from(models)
      .sort((left, right) => left.localeCompare(right))
      .map((model) => ({ value: model, label: model }))
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
  readonly dailyActiveUsers = computed(() =>
    (this.usageOverview()?.daily ?? []).map((item) => ({ date: item.date, count: item.activeUsers }))
  )
  readonly dailyConversations = computed(() =>
    (this.usageOverview()?.daily ?? []).map((item) => ({ date: item.date, count: item.conversationCount }))
  )
  readonly userOptions = derivedAsync(() =>
    this.userService.search('').pipe(
      map((users) =>
        users.map(
          (user: IUser) =>
            ({
              value: user.id,
              label: userLabel(user),
              description: user.email
            }) as TSelectOption<string>
        )
      )
    )
  )

  constructor() {
    effect(
      () => {
        const selectedModel = this.selectedModel()
        const modelOptions = this.modelOptions()

        if (!selectedModel || !Array.isArray(modelOptions)) {
          return
        }

        if (!modelOptions.some((option) => option.value === selectedModel)) {
          this.selectedModel.set(null)
        }
      },
      { allowSignalWrites: true }
    )
  }

  readonly xperts = derivedAsync(() => this.xpertService.getStatisticsXperts([]))
  readonly xpertIntegrations = derivedAsync(() => this.xpertService.getStatisticsXpertIntegrations([]))

  private modelLabel(provider?: string | null, model?: string | null) {
    return [provider, model].filter(Boolean).join(' / ') || 'Unknown model'
  }
}
