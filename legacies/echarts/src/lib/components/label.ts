import { assignDeepOmitBlank, ChartMeasure, ChartSettings, omit, PropertyMeasure } from '@metad/ocap-core'
import { formatMeasureValue } from '../common'
import { EChartsOptions } from '../types'

export interface EChartsLabel {
  position?: string
  formatter?: string
}

export function labelFormatter(
  formatter: string,
  measure: ChartMeasure,
  property: PropertyMeasure,
  settings: ChartSettings
) {
  return (params) => {
    const { value, shortUnit, unit } = formatMeasureValue(measure, property, params.value, settings?.locale)
    if (formatter) {
      return formatter
        .replace(/\{name\}/g, params.name)
        .replace(/\{value\}/g, value + (shortUnit ?? ''))
        .replace(/\{unit\}/g, unit ?? '')
    }
    let values = `{value|${value + (shortUnit ?? '')}}`
    if (unit) {
      values += ` {unit|${unit}}`
    }
    return ['{name|' + params.name + '}', '{hr|}', values].join('\n')
  }
}

export function seriesLabel(
  base: EChartsLabel,
  measure: ChartMeasure,
  property: PropertyMeasure,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const formatter = measure.chartOptions?.['seriesStyle']?.label?.formatter ?? options?.seriesStyle?.label?.formatter
  return assignDeepOmitBlank(
    assignDeepOmitBlank(
      {
        ...base,
        formatter: labelFormatter(formatter ?? base.formatter, measure, property, settings),
        rich: {
          name: {
            fontSize: 16,
            lineHeight: 20
          },
          value: {
            fontSize: 16,
            lineHeight: 20
          },
          unit: {
            fontSize: 9,
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: '#fff',
            borderRadius: 2,
            padding: [2, 4],
            lineHeight: 20,
            align: 'right'
          },
          hr: {
            width: '100%',
            borderColor: 'rgba(255,255,255,0.2)',
            borderWidth: 0.5,
            height: 0,
            lineHeight: 10
          }
        }
      },
      omit(options?.seriesStyle?.label, 'formatter'),
      3
    ),
    omit(measure.chartOptions?.['seriesStyle']?.label, 'formatter'),
    3
  )
}

export function seriesUpperLabel(
  base: EChartsLabel,
  measure: ChartMeasure,
  property: PropertyMeasure,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const formatter =
    measure.chartOptions?.['seriesStyle']?.upperLabel?.formatter ?? options?.seriesStyle?.upperLabel?.formatter
  return assignDeepOmitBlank(
    assignDeepOmitBlank(
      {
        ...base,
        formatter: labelFormatter(formatter ?? '{name}', measure, property, settings)
      },
      omit(options?.seriesStyle?.upperLabel, 'formatter'),
      3
    ),
    omit(measure.chartOptions?.['seriesStyle']?.upperLabel, 'formatter'),
    3
  )
}
