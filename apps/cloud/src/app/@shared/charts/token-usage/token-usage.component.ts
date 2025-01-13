import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, LOCALE_ID } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { EChartsOption } from 'echarts'
import { groupBy } from 'lodash-es'
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
  selector: 'pac-statistics-token-usage',
  templateUrl: 'token-usage.component.html',
  styleUrl: 'token-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatisticsTokenUsageComponent {
  readonly locale = inject(LOCALE_ID)
  readonly num = new DecimalPipe(this.locale)

  readonly tokenCost = input<any[]>()

  readonly items = computed(() =>
    this.tokenCost()?.map((item) => ({
      ...item,
      date: item.date ? new Date(item.date).toLocaleDateString().slice(0, 10) : 'N/A'
    }))
  )

  readonly data = computed(() => {
    const items = this.items()
    if (!items) return

    const groupedItems = groupBy(items, (item) => `${item.model}__${item.currency}`)
    return Object.keys(groupedItems).map((key) => {
      const separatorIndex = key.lastIndexOf('__')
      const model = key.substring(0, separatorIndex)
      const currency = key.substring(separatorIndex + 2)

      return {
        name: model + ' ' + currency,
        model,
        currency,
        items: groupedItems[key]
      }
    })
  })

  readonly totals = computed(() => {
    const items = this.items()
    if (!items) return

    const groupedItems = groupBy(items, (item) => item.currency)
    return Object.keys(groupedItems).map((currency) => {
      return {
        currency,
        usage: groupedItems[currency].reduce(
          (acc, curr) => {
            acc.tokens += curr.tokens ? Number(curr.tokens) : 0
            acc.price += curr.price ? Number(curr.price) : 0
            return acc
          },
          { tokens: 0, price: 0 }
        )
      }
    })
  })

  readonly options = computed(() => {
    const groups = this.data()
    return (
      groups &&
      ({
        grid: {
          left: 60,
          right: 20,
          bottom: 30
        },
        legend: {
          left: '10%'
        },
        xAxis: {
          type: 'time',
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            show: true
          }
        },
        tooltip: {
          trigger: 'axis'
        },
        series: groups.map((g) => {
          return {
            name: g.name,
            type: 'bar',
            stack: g.currency,
            data: g.items.map((item) => {
              const now = new Date(item.date)
              return {
                name: now.toString(),
                value: [[now.getFullYear(), now.getMonth() + 1, now.getDate()].join('/'), item.tokens]
              }
            }),
            barMaxWidth: 20,
            tooltip: {
              valueFormatter: (value, index) => {
                const price = g.items[index]['price']
                return (price ? '~' + this.num.transform(price, '0.0-7') + ' / ' : '') + 't:' + value
              }
            }
          }
        })
      } as EChartsOption)
    )
  })
}
