import { ChartDataZoomType, ChartProperty, omitBlank, PropertyHierarchy } from '@metad/ocap-core'
import { AxisEnum } from '../types'
import { mergeChartOptions } from '../utils'

/**
 * Get dataZoom of slider or inside from ChartDimension or ChartMeasure
 *
 * @param dimension
 * @param orient
 * @param hierarchy
 * @returns
 */
export function getAxisDataZooms(dimension: ChartProperty, orient: AxisEnum, hierarchy?: PropertyHierarchy) {
  const dataZooms = []
  const dataZoom = dimension?.chartOptions?.dataZoom
  if (dataZoom) {
    if (dataZoom.type?.includes(ChartDataZoomType.slider)) {
      dataZooms.push(
        mergeChartOptions(
          omitBlank({
            type: ChartDataZoomType.slider,
            xAxisIndex: orient === AxisEnum.x ? 0 : null,
            yAxisIndex: orient === AxisEnum.y ? 0 : null
          }),
          ['type'],
          dataZoom
        )
      )
    }

    if (dataZoom.type?.includes(ChartDataZoomType.inside)) {
      dataZooms.push(
        mergeChartOptions(
          omitBlank({
            type: ChartDataZoomType.inside,
            xAxisIndex: orient === AxisEnum.x ? 0 : null,
            yAxisIndex: orient === AxisEnum.y ? 0 : null
          }),
          ['type'],
          dataZoom,
        )
      )
    }
  }

  return dataZooms
}
