import { ChartAnnotation, ChartSettings, EntityType, QueryReturn } from '@metad/ocap-core'
import { Bar3DChart } from 'echarts-gl/charts'
import { Grid3DComponent } from 'echarts-gl/components'
import { use } from 'echarts/core'
import { cartesian3d } from './cartesian3d'
import { EChartsOptions } from './types'

use([Grid3DComponent, Bar3DChart])

export function bar3d(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  return cartesian3d(data, chartAnnotation, entityType, settings, options, 'bar3D')
}
