import { ChartAnnotation, ChartSettings, EntityType, QueryReturn } from '@xpert-ai/ocap-core'
import { cartesian3d } from './cartesian3d'
import { EChartsOptions } from './types'

export function line3d(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  return cartesian3d(data, chartAnnotation, entityType, settings, options, 'line3D')
}
