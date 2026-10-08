import { useEffect, useRef } from 'react'
import { init, use, type EChartsCoreOption } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, AriaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useLocale, t } from '../i18n'
import { formatNumber } from './shared'
import type { UsageBucket } from './types'

use([BarChart, GridComponent, TooltipComponent, AriaComponent, CanvasRenderer])

export function UsageChart({ buckets }: { buckets: UsageBucket[] }) {
  const element = useRef<HTMLDivElement>(null)
  const locale = useLocale()
  useEffect(() => {
    if (!element.current) return
    const chart = init(element.current)
    const render = () => {
      const style = getComputedStyle(element.current!)
      const color = (name: string) => style.getPropertyValue(`--xui-color-${name}`).trim()
      const option: EChartsCoreOption = {
        animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
        aria: {
          enabled: true,
          label: { description: `${t('Daily points consumed')} (UTC)` }
        },
        textStyle: { fontFamily: style.fontFamily },
        grid: { left: 8, right: 12, top: 20, bottom: 12, containLabel: true },
        tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: (value: number) => formatNumber(value) },
        xAxis: {
          type: 'category',
          data: buckets.map((row) => row.date.slice(5).replace('-', '/')),
          axisTick: { show: false },
          axisLine: { lineStyle: { color: color('border') } },
          axisLabel: { color: color('muted-foreground'), margin: 14 }
        },
        yAxis: {
          type: 'value',
          min: 0,
          minInterval: 1,
          splitNumber: 3,
          axisLabel: { color: color('muted-foreground'), formatter: (value: number) => formatNumber(value) },
          splitLine: { lineStyle: { color: color('border'), opacity: 0.5 } }
        },
        series: [
          {
            name: t('Points consumed'),
            type: 'bar',
            data: buckets.map((row) => row.pointsUsed),
            barMaxWidth: 56,
            itemStyle: { color: color('chart-1'), borderRadius: [4, 4, 0, 0] }
          }
        ]
      }
      chart.setOption(option)
    }
    render()
    const resize = new ResizeObserver(() => chart.resize())
    resize.observe(element.current)
    const theme = new MutationObserver(render)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => {
      resize.disconnect()
      theme.disconnect()
      chart.dispose()
    }
  }, [buckets, locale])
  return <div ref={element} role="img" aria-label={t('Daily points consumed')} className="h-64 w-full sm:h-72" />
}
