import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { EChartsOption } from 'echarts'
import { maxBy } from 'lodash-es'
import { NgxEchartsDirective } from 'ngx-echarts'


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
    NgxEchartsDirective
  ],
  selector: 'xpert-statistics-chart',
  templateUrl: './chart.component.html',
  styleUrl: 'chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStatisticsChartComponent {
  readonly data = input<{ date: string; count: number }[]>()
  readonly measureLabel = input<string>()
  readonly totalType = input<'sum' | 'avg'>('sum')

  readonly total = computed(() => {
    const total = this.data()?.reduce((acc, { count }) => acc + (Number(count) ?? 0), 0)
    return this.totalType() === 'avg' ? total / this.data()?.length : total
  })
  readonly options = computed(() => {
    const items = this.data()
    const max = maxBy(items, 'count')?.['count']
    return (
      items &&
      ({
        grid: {
          left: 40,
          right: 20,
          bottom: 30
        },
        xAxis: {
          type: 'category',
          data: items.map(({ date }) => date ? new Date(date).toLocaleDateString().slice(0, 10) : 'N/A')
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            show: true,
          }
        },
        tooltip: {
          trigger: 'axis'
        },
        series: [
          {
            name: this.measureLabel(),
            data: items.map(({ count }) => count),
            type: 'line'
          }
        ],
        visualMap: [
          {
            show: false,
            type: 'continuous',
            seriesIndex: 0,
            min: 0,
            max
          }
        ]
      } as EChartsOption)
    )
  })
}
