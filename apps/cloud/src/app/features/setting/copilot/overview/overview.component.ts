import { Component, computed, inject, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@metad/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectCopilotServer, KnowledgebaseService, XpertAPIService } from 'apps/cloud/src/app/@core'
import { StatisticsChartComponent, StatisticsPieChartComponent, StatisticsTokenUsageComponent } from 'apps/cloud/src/app/@shared/charts'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { derivedAsync } from 'ngxtension/derived-async'

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
    MatTooltipModule,
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

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly selectedTimeOption = computed(() => TimeRangeOptions.find((_) => _.value === this.timeRangeValue())?.label)

  readonly dailyConv = derivedAsync(() => this.copilotService.getStatisticsDailyConversations(this.timeRange()))
  readonly dailyEndUsers = derivedAsync(() => this.copilotService.getStatisticsDailyEndUsers(this.timeRange()))
  readonly averageSessionInteractions = derivedAsync(() =>
    this.copilotService.getStatisticsAverageSessionInteractions(this.timeRange())
  )
  readonly dailyMessages = derivedAsync(() => this.copilotService.getStatisticsDailyMessages(this.timeRange()))
  readonly tokensPerSecond = derivedAsync(() => this.copilotService.getStatisticsTokensPerSecond(this.timeRange()))
  readonly userSatisfactionRate = derivedAsync(() =>
    this.copilotService.getStatisticsUserSatisfactionRate(this.timeRange())
  )
  readonly tokenCost = derivedAsync(() => this.copilotService.getStatisticsTokenCost(this.timeRange()))
  readonly xperts = derivedAsync(() => this.xpertService.getStatisticsXperts([]))
  readonly xpertMessages = derivedAsync(() => this.xpertService.getStatisticsXpertMessages(this.timeRange()))
  readonly xpertTokens = derivedAsync(() => this.xpertService.getStatisticsXpertTokens(this.timeRange()))
  readonly xpertIntegrations = derivedAsync(() => this.xpertService.getStatisticsXpertIntegrations([]))
  readonly knowledgebases = derivedAsync(() => this.knowledgebaseService.getStatisticsKnowledgebases([]))
}
