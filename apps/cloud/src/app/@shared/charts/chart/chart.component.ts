import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, LOCALE_ID } from '@angular/core'
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
  selector: 'pac-statistics-chart',
  templateUrl: './chart.component.html',
  styleUrl: 'chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatisticsChartComponent {
  readonly locale = inject(LOCALE_ID)
  readonly num = new DecimalPipe(this.locale)
  
  readonly data = input<{ date: string; count?: number; token?: number; }[]>()
  readonly measureLabel = input<string>()
  readonly measure = input<string>('count')
  readonly unit = input<string>('')
  readonly totalType = input<'sum' | 'avg'>('sum')

  readonly total = computed(() => {
    const total = this.data()?.reduce((acc, curr) => acc + (Number(curr[this.measure()]) ?? 0), 0)
    return this.totalType() === 'avg' ? total / this.data()?.length : total
  })
  readonly options = computed(() => {
    const items = this.data()
    const max = maxBy(items, this.measure())?.[this.measure()]
    return (
      items &&
      ({
        grid: {
          right: 20,
          bottom: 30,
          containLabel: true
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
            data: items.map((item) => item[this.measure()]),
            type: 'line',
            tooltip: {
              valueFormatter: (value, index) => {
                return this.num.transform(value as number, '0.0-7') + this.unit()
              }
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: 'rgba(255, 158, 68, 0.5)'
                  },
                  {
                    offset: 1,
                    color: 'rgba(255, 158, 68, 0)'
                  }
                ],
                global: false
              }
            },
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
