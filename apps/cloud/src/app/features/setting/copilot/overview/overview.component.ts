import { Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { UsersService } from '@xpert-ai/cloud/state'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@xpert-ai/core'
import { NgmI18nPipe, TSelectOption } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IUser, injectCopilotServer, KnowledgebaseService, XpertAPIService } from 'apps/cloud/src/app/@core'
import {
  StatisticsChartComponent,
  StatisticsPieChartComponent,
  StatisticsTokenUsageComponent
} from 'apps/cloud/src/app/@shared/charts'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { derivedAsync } from 'ngxtension/derived-async'
import { map } from 'rxjs'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'pac-settings-copilot-overview',
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ...ZardTooltipImports,
    NgmI18nPipe,
    NgmSelectComponent,
    StatisticsChartComponent,
    StatisticsPieChartComponent,
    StatisticsTokenUsageComponent
  ]
})
export class CopilotOverviewComponent {
  TimeRanges = TimeRangeOptions

  readonly copilotService = injectCopilotServer()
  readonly xpertService = inject(XpertAPIService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly userService = inject(UsersService)

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly selectedModel = model<string | null>(null)
  readonly selectedUserId = model<string | null>(null)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly selectedTimeOption = computed(() => TimeRangeOptions.find((_) => _.value === this.timeRangeValue())?.label)
  readonly statisticsFilters = computed(() => ({
    ...(this.selectedModel() ? { model: this.selectedModel() } : {}),
    ...(this.selectedUserId() ? { userId: this.selectedUserId() } : {})
  }))
  readonly modelOptions = derivedAsync(() =>
    this.copilotService.getStatisticsModels(this.timeRange(), { userId: this.selectedUserId() }).pipe(
      map((items) =>
        items.map((item) => ({
          value: item.model,
          label: item.model
        }))
      )
    )
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

  readonly dailyConv = derivedAsync(() =>
    this.copilotService.getStatisticsDailyConversations(this.timeRange(), this.statisticsFilters())
  )
  readonly dailyEndUsers = derivedAsync(() =>
    this.copilotService.getStatisticsDailyEndUsers(this.timeRange(), this.statisticsFilters())
  )
  readonly averageSessionInteractions = derivedAsync(() =>
    this.copilotService.getStatisticsAverageSessionInteractions(this.timeRange(), this.statisticsFilters())
  )
  readonly dailyMessages = derivedAsync(() =>
    this.copilotService.getStatisticsDailyMessages(this.timeRange(), this.statisticsFilters())
  )
  readonly tokensPerSecond = derivedAsync(() =>
    this.copilotService.getStatisticsTokensPerSecond(this.timeRange(), this.statisticsFilters())
  )
  readonly userSatisfactionRate = derivedAsync(() =>
    this.copilotService.getStatisticsUserSatisfactionRate(this.timeRange(), this.statisticsFilters())
  )
  readonly tokenCost = derivedAsync(() =>
    this.copilotService.getStatisticsTokenCost(this.timeRange(), this.statisticsFilters())
  )
  readonly xperts = derivedAsync(() => this.xpertService.getStatisticsXperts([]))
  readonly xpertMessages = derivedAsync(() =>
    this.xpertService.getStatisticsXpertMessages(this.timeRange(), this.statisticsFilters())
  )
  readonly xpertTokens = derivedAsync(() =>
    this.xpertService.getStatisticsXpertTokens(this.timeRange(), this.statisticsFilters())
  )
  readonly xpertIntegrations = derivedAsync(() => this.xpertService.getStatisticsXpertIntegrations([]))
  readonly knowledgebases = derivedAsync(() => this.knowledgebaseService.getStatisticsKnowledgebases([]))
}
