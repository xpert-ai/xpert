import { DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, LOCALE_ID } from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { ICopilotUsageOverviewBucket } from '@xpert-ai/contracts'
import type { EChartsOption } from 'echarts'
import { groupBy } from 'lodash-es'
import { EchartsDirective } from '../echarts.directive'

@Component({
  standalone: true,
  imports: [DecimalPipe, TranslateModule, EchartsDirective],
  selector: 'xp-statistics-token-usage',
  templateUrl: 'token-usage.component.html',
  styleUrl: 'token-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatisticsTokenUsageComponent {
  readonly buckets = input<ICopilotUsageOverviewBucket[] | null>()
  private readonly num = new DecimalPipe(inject(LOCALE_ID))
  private readonly translate = inject(TranslateService)

  readonly groups = computed(() => {
    const groups = groupBy(this.buckets() ?? [], (item) =>
      [item.provider, item.model || 'All models'].filter(Boolean).join(' / ')
    )
    return Object.entries(groups).map(([name, items]) => ({
      name,
      items,
      points: items.reduce((total, item) => total + item.membershipPointsUsed, 0)
    }))
  })

  readonly options = computed<EChartsOption>(() => ({
    grid: { left: 60, right: 20, bottom: 30, top: 100 },
    legend: { left: '10%' },
    xAxis: { type: 'time' },
    yAxis: { type: 'value' },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) =>
        `${this.num.transform(Number(value), '1.0-10')} ${this.translate.instant('XP.Membership.PointsShort')}`
    },
    series: this.groups().map(({ name, items }) => ({
      name,
      type: 'bar',
      encode: { x: 0, y: 1, tooltip: [1] },
      barMaxWidth: 20,
      data: items.map(({ date, membershipPointsUsed }) => [date, membershipPointsUsed])
    }))
  }))
}
