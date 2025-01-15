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
  selector: 'pac-statistics-pie-chart',
  templateUrl: './chart.component.html',
  styleUrl: 'chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatisticsPieChartComponent {
  readonly locale = inject(LOCALE_ID)
  readonly num = new DecimalPipe(this.locale)

  readonly data = input<{ date?: string; count?: number; token?: number }[]>()
  readonly measureLabel = input<string>()
  readonly dimension = input<string>('date')
  readonly measure = input<string>('count')
  readonly unit = input<string>('')
  readonly totalType = input<'sum' | 'avg'>('sum')

  readonly total = computed(() => {
    const total = this.data()?.reduce((acc, curr) => acc + (Number(curr[this.measure()]) ?? 0), 0)
    return this.totalType() === 'avg' ? total / this.data()?.length : total
  })
  readonly options = computed(() => {
    const items = this.data()
    return (
      items &&
      ({
        tooltip: {
          trigger: 'item'
        },
        legend: {
          type: 'scroll',
          orient: 'vertical',
          top: '5%',
          right: '0',
          align: 'right'
        },
        series: [
          {
            name: this.measureLabel(),
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['30%', '50%'],
            padAngle: 3,
            itemStyle: {
              borderRadius: 5
            },
            label: {
              show: false,
              position: 'center'
            },
            labelLine: {
              show: false
            },
            data: items.map((item) => ({ value: item[this.measure()], name: item[this.dimension()] })),
          }
        ],
      } as EChartsOption)
    )
  })
}
