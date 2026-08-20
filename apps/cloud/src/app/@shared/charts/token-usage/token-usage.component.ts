import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, DecimalPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, LOCALE_ID } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { EChartsOption } from 'echarts'
import { groupBy } from 'lodash-es'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { EchartsDirective } from '../echarts.directive'
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    EchartsDirective
  ],
  selector: 'xp-statistics-token-usage',
  templateUrl: 'token-usage.component.html',
  styleUrl: 'token-usage.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatisticsTokenUsageComponent {
  readonly locale = inject(LOCALE_ID)
  readonly num = new DecimalPipe(this.locale)

  readonly tokenCost = input<any[]>()
  readonly displayMode = input<'price' | 'membership'>('price')

  readonly items = computed(() =>
    this.tokenCost()?.map((item) => ({
      ...item,
      date:
        typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
          ? item.date
          : item.date
            ? new Date(item.date).toLocaleDateString().slice(0, 10)
            : 'N/A',
      model: item.provider ? `${item.provider} / ${item.model || 'All models'}` : item.model || 'All models',
      tokens: Number(item.tokens ?? item.tokenUsed ?? 0),
      membershipPointsUsed: Number(item.membershipPointsUsed ?? item.pointsUsed ?? 0)
    }))
  )

  readonly data = computed(() => {
    const items = this.items()
    if (!items) return

    const groupedItems = groupBy(items, (item) =>
      this.displayMode() === 'membership' ? item.model : `${item.model}__${item.currency}`
    )
    return Object.keys(groupedItems).map((key) => {
      const separatorIndex = key.lastIndexOf('__')
      const isMembershipMode = this.displayMode() === 'membership'
      const model = isMembershipMode ? key : key.substring(0, separatorIndex)
      const currency = isMembershipMode ? undefined : key.substring(separatorIndex + 2)

      return {
        key,
        name: isMembershipMode ? model : model + ' ' + currency,
        model,
        currency,
        items: groupedItems[key]
      }
    })
  })

  readonly totals = computed(() => {
    const items = this.items()
    if (!items) return

    const groupedItems = groupBy(items, (item) => (this.displayMode() === 'membership' ? item.model : item.currency))
    return Object.keys(groupedItems).map((key) => {
      return {
        key,
        currency: this.displayMode() === 'membership' ? undefined : key,
        model: this.displayMode() === 'membership' ? key : undefined,
        usage: groupedItems[key].reduce(
          (acc, curr) => {
            acc.tokens += curr.tokens ? Number(curr.tokens) : 0
            acc.price += curr.price ? Number(curr.price) : 0
            acc.membershipPointsUsed += curr.membershipPointsUsed ? Number(curr.membershipPointsUsed) : 0
            return acc
          },
          { tokens: 0, price: 0, membershipPointsUsed: 0 }
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
          bottom: 30,
          top: 100
        },
        legend: {
          left: '10%'
        },
        xAxis: {
          type: 'time'
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
            stack: g.key,
            data: g.items.map((item) => {
              const now = new Date(`${item.date}T00:00:00`)
              return {
                name: now.toString(),
                value: [[now.getFullYear(), now.getMonth() + 1, now.getDate()].join('/'), item.tokens]
              }
            }),
            barMaxWidth: 20,
            tooltip: {
              valueFormatter: (value, index) => {
                if (this.displayMode() === 'membership') {
                  const points = g.items[index]['membershipPointsUsed']
                  return `${this.num.transform(points, '0.0-10')} pts / t:${value}`
                }

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
