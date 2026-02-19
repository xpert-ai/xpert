import { ChartAnnotation, ChartSettings, EntityType, QueryReturn } from '@metad/ocap-core'
import { cartesian } from './cartesian'
import { EChartsContext, EChartsOptions } from './types'

export function line(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  return cartesian(data, chartAnnotation, entityType, settings, options, 'line')
}
