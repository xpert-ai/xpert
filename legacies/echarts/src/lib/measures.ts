import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartSettings,
  EntityType,
  getEntityProperty,
  mergeOptions,
  QueryReturn
} from '@metad/ocap-core'
import { formatMeasureNumber } from './common'
import { EChartsContext, EChartsOptions } from './types'
import { pickEChartsGlobalOptions } from './utils'

/**
 * Calculate funnel chart echarts options
 *
 * @param data
 * @param chartAnnotation
 * @param entityType
 * @param settings
 * @param options
 * @returns
 */
export function Funnel(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  const context = {
    data,
    chartAnnotation,
    entityType,
    settings,
    options
  }

  const item = data.data[0]

  const series = {
    type: 'funnel',
    minSize: '20%',
    maxSize: '100%',
    data: chartAnnotation.measures.map((measure) => {
      const property = getEntityProperty(entityType, measure)
      return {
        value: item[measure.measure],
        name: property.caption || property.name,
        tooltip: assignDeepOmitBlank(
          {
            valueFormatter: (value: number | string) => {
              return formatMeasureNumber({ measure, property }, value, settings.locale, measure.formatting?.shortNumber)
            }
          },
          measure.chartOptions?.tooltip
        )
      }
    })
  }

  const echartsOptions: any = {
    tooltip: assignDeepOmitBlank(
      {
        trigger: 'item'
      },
      options?.tooltip
    ),
    series: [assignDeepOmitBlank(series, options?.seriesStyle)]
  }

  if (options?.legend) {
    echartsOptions.legend = assignDeepOmitBlank({}, options.legend)
  }

  mergeOptions(echartsOptions, pickEChartsGlobalOptions(options))

  return {
    ...context,
    echartsOptions
  }
}
