import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, LOCALE_ID } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertService } from 'apps/cloud/src/app/@core'
import { EChartsOption } from 'echarts'
import { groupBy } from 'lodash-es'
import { NgxEchartsDirective } from 'ngx-echarts'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { XpertStatisticsComponent } from '../statistics.component'

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
    NgxEchartsDirective,
  ],
  selector: 'xpert-statistics-token-usage',
  templateUrl: 'token-usage.component.html',
  styleUrl: 'token-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStatisticsTokenUsageComponent {
  readonly statistic = inject(XpertStatisticsComponent)
  readonly xpertService = inject(XpertService)
  readonly locale = inject(LOCALE_ID)
  readonly num = new DecimalPipe(this.locale)

  readonly xpertId = this.statistic.xpertId
  readonly timeRange = this.statistic.timeRange
  readonly selectedTimeOption = this.statistic.selectedTimeOption

  readonly tokenCost = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getStatisticsTokenCost(this.xpertId(), this.timeRange()) : of(null)
  })

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
            usage: groupedItems[currency].reduce((acc, curr) => {
                acc.tokens += (curr.tokens ? Number(curr.tokens) : 0)
                acc.price += (curr.price ? Number(curr.price) : 0)
                return acc
            }, {tokens: 0, price: 0})
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
          type: 'time'
          //   data: this.dates()
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

  constructor() {
    effect(() => {
    //   console.log(this.totals())
    })
  }
}
