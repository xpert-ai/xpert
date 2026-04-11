import { ChartAnnotation, ChartSettings, EntityType, QueryReturn } from '@xpert-ai/ocap-core'
import { BarChart } from 'echarts/charts'
import { use } from 'echarts/core'
import { cartesian } from './cartesian'
import { EChartsOptions } from './types'

use([BarChart])

export function bar(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions,
) {
  return cartesian(data, chartAnnotation, entityType, settings, options, 'bar')
}
