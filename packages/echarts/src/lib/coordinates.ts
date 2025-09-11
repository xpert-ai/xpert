import {
  PieVariant,
  getChartTrellis,
  getDimensionMemberCaption,
  getPropertyHierarchy,
  isNil,
  mergeOptions,
  omit,
} from '@metad/ocap-core'
import { chunk, groupBy } from 'lodash-es'
import {
  CoordinateContext,
  EChartsContext,
  EChartsOptions,
  ICoordinate,
  isCoordinateCalendar,
  isCoordinateCartesian2d,
  isCoordinatePolar,
  isCoordinateSingleAxis
} from './types'
import { pickEChartsGlobalOptions } from './utils'
import { serializeSeriesComponent } from './components/series'

export function gatherCoordinates(coordinates: ICoordinate[], type: 'pie' | string, options: EChartsOptions) {
  const echartsOptions: any = {
    dataset: [],
    title: {},
    grid: [],
    series: [],
    visualMap: [],
    tooltip: [],
    legend: [],
    dataZoom: [] // dataZoom(options)
  }

  coordinates.forEach((coordinate, gridIndex) => {
    echartsOptions.grid.push(coordinate.grid)

    coordinate.datasets.forEach(({ dataset, series }) => {
      series.forEach(({options: series, visualMaps}) => {
        if (isCoordinatePolar(coordinate)) {
          echartsOptions.series.push({
            ...series,
            angleAxis: (echartsOptions.angleAxis?.length ?? 0) + (series.angleAxisIndex ?? 0),
            radiusAxis: (echartsOptions.radiusAxis?.length ?? 0) + (series.radiusAxis ?? 0),
            datasetIndex: echartsOptions.dataset.length + (series.datasetIndex ?? 0),
            type: series.type ?? type,
            coordinateSystem: 'polar'
          })
        } else if(isCoordinateCalendar(coordinate)) {
          echartsOptions.series.push({
            ...series,
            type: series.type ?? type
          })
        } else {
          echartsOptions.series.push({
            ...series,
            xAxisIndex: (echartsOptions.xAxis?.length ?? 0) + (series.xAxisIndex ?? 0),
            yAxisIndex: (echartsOptions.yAxis?.length ?? 0) + (series.yAxisIndex ?? 0),
            datasetIndex: echartsOptions.dataset.length + (series.datasetIndex ?? 0),
            type: series.type ?? type
          })
        }

        if (visualMaps) {
          echartsOptions.visualMap.push(...visualMaps.map((item) => ({
            ...item,
            seriesIndex: echartsOptions.series.length - 1
          })))
        }
      })

      if (dataset) {
        const datasetIndex = echartsOptions.dataset.length
        echartsOptions.dataset.push(omit(dataset, 'transforms'))
        echartsOptions.dataset.push(...(dataset.transforms ?? []).map((transform) => {
          if (!isNil(transform.fromDatasetIndex)) {
            transform.fromDatasetIndex = datasetIndex + transform.fromDatasetIndex
          }
          return transform
        }))
      }
    })

    coordinate.dataZoom?.forEach((dataZoom) => {
      !isNil(dataZoom.xAxisIndex) && (dataZoom.xAxisIndex = (echartsOptions.xAxis?.length ?? 0) + (dataZoom.xAxisIndex ?? 0))
      !isNil(dataZoom.yAxisIndex) && (dataZoom.yAxisIndex = (echartsOptions.yAxis?.length ?? 0) + (dataZoom.yAxisIndex ?? 0))
      echartsOptions.dataZoom.push(dataZoom)
    })

    if (type !== 'pie' && isCoordinateCartesian2d(coordinate)) {
      echartsOptions.xAxis = echartsOptions.xAxis ?? []
      echartsOptions.xAxis.push(
        ...(coordinate.xAxis?.map((xAxis) => ({
          ...xAxis,
          gridIndex
        })) ?? [])
      )

      echartsOptions.yAxis = echartsOptions.yAxis ?? []
      echartsOptions.yAxis.push(
        ...(coordinate.yAxis?.map((yAxis) => ({
          ...yAxis,
          gridIndex
        })) ?? [])
      )
    }

    if (isCoordinatePolar(coordinate)) {
      // polar
      echartsOptions.polar = echartsOptions.polar ?? []
      echartsOptions.polar.push(coordinate.polar ?? {})

      // radiusAxis
      echartsOptions.radiusAxis = echartsOptions.radiusAxis ?? []
      echartsOptions.radiusAxis.push({
        ...(coordinate.radiusAxis?.[0] ?? {}),
        polarIndex: gridIndex
      })
      // angleAxis
      echartsOptions.angleAxis = echartsOptions.angleAxis ?? []
      echartsOptions.angleAxis.push({
        ...(coordinate.angleAxis?.[0] ?? {}),
        polarIndex: gridIndex
      })
    }

    // coordinate.visualMap && echartsOptions.visualMap.push(...coordinate.visualMap)
    coordinate.tooltip && echartsOptions.tooltip.push(...coordinate.tooltip)
    coordinate.legend && echartsOptions.legend.push(...coordinate.legend)

    if (isCoordinateSingleAxis(coordinate)) {
      echartsOptions.singleAxis = echartsOptions.singleAxis ?? []
      echartsOptions.singleAxis.push(...coordinate.singleAxis)
    }

    if (isCoordinateCalendar(coordinate)) {
      echartsOptions.calendar = echartsOptions.calendar ?? []
      echartsOptions.calendar.push(coordinate.calendar)
    }

    if (coordinate.visualMap?.length) {
      echartsOptions.visualMap.push(...coordinate.visualMap)
    }
  })

  // visualMaps
  if (options?.visualMaps) {
    echartsOptions.visualMap.push(...options.visualMaps)
  }

  mergeOptions(echartsOptions, pickEChartsGlobalOptions(options))

  return echartsOptions
}

/**
 * get coordinates by trellis or single coordinate
 *
 * @param context CoordinateContext
 * @param coordinateType
 * @param cartesianCoordinate
 * @returns
 */
export function trellisCoordinates(
  context: CoordinateContext,
  coordinateType: 'grid' | 'pie',
  cartesianCoordinate: (context: EChartsContext, data: Array<any>, serializeSeriesComponent, ...i) => ICoordinate,
) {
  const {data, chartAnnotation, entityType, settings, options} = context
  const trellis = getChartTrellis(chartAnnotation)
  if (trellis) {
    const trellisName = getPropertyHierarchy(trellis)
    const trellisCaption = getDimensionMemberCaption(trellis, entityType)
    const trellisResults = groupBy(data.data, trellisName)

    const coordinates = Object.keys(trellisResults).map((trellisKey) => {
      const dimensions = [...chartAnnotation.dimensions]
      const index = dimensions.indexOf(trellis)
      dimensions.splice(index, 1)

      const coordinate = cartesianCoordinate(
        {
          ...context,
          chartAnnotation: {
            ...chartAnnotation,
            dimensions
          }
        },
        trellisResults[trellisKey],
        serializeSeriesComponent,
        data.schema,
      )

      coordinate.name = trellisResults[trellisKey][0]?.[trellisCaption] || trellisKey
      coordinate.datasets = coordinate.datasets.map((dataset) => ({
        ...dataset,
        series: dataset.series.map((series) => ({
          ...series,
          options: {
            ...series.options,
            id: `${trellisKey}-${series.options.id}`
          }
        }))
      }))
      return coordinate
    })

    const trellisHorizontal = settings?.trellisHorizontal ?? 2
    const trellisVertical = Math.ceil(coordinates.length / trellisHorizontal)

    const coordinatesGroups = chunk(coordinates, trellisHorizontal)

    const coordinateResults: ICoordinate[] = []
    coordinatesGroups.forEach((group, v) => {
      group.forEach((coordinate, h) => {
        // Trellis title
        const title = {
          text: coordinate.name,
          textStyle: {
            fontSize: '1rem'
          },
          left: (h + 0.4) * (100 / trellisHorizontal) + '%',
          top: v * (100 / trellisVertical) + '%'
        }
        if (coordinateType === 'grid') {
          coordinateResults.push({
            ...coordinate,
            title,
            grid: {
              ...coordinate.grid,
              left: (h + 0.1) * (100 / trellisHorizontal) + '%',
              top: (v + 0.2) * (100 / trellisVertical) + '%',
              width: (100 / trellisHorizontal) * 0.8 + '%',
              height: (100 / trellisVertical) * 0.7 + '%'
            }
          })
        } else if (coordinateType === 'pie') {
          const minRadius = Math.max(100 / trellisHorizontal, 100 / trellisVertical)
          const radius =
            chartAnnotation.chartType.variant === PieVariant.Doughnut || chartAnnotation.chartType.variant === PieVariant.Nightingale
              ? [minRadius * 0.4 + '%', minRadius * 0.7 + '%']
              : minRadius * 0.7 + '%'

          coordinateResults.push({
            ...coordinate,
            title,
            datasets: coordinate.datasets.map((dataset) => ({
              ...dataset,
              series: dataset.series.map((series) => ({
                ...series,
                options: {
                  ...series.options,
                  radius,
                  center: [(h + 0.5) * (100 / trellisHorizontal) + '%', (v + 0.5) * (100 / trellisVertical) + '%']
                }
              }))
            }))
          })
        }
      })
    })

    return coordinateResults
  }

  return [cartesianCoordinate(context, data.data, serializeSeriesComponent, data.schema)]
}
