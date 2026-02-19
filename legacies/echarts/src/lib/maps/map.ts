import {
  ChartAnnotation,
  ChartDimensionRoleType,
  ChartSettings,
  EntityType,
  getChartCategory,
  getPropertyHierarchy,
  getPropertyMeasure,
  getPropertyName,
  isChartMapType,
  QueryReturn,
  assignDeepOmitBlank,
  getDimensionMemberCaption,
} from '@metad/ocap-core'
import { MapChart } from 'echarts/charts'
import { registerMap, use } from 'echarts/core'
import { firstValueFrom, Observable, shareReplay, tap } from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import { formatMeasureNumber } from '../common'
import { measuresToSeriesComponents } from '../components/series'
import { formatNumber } from '../decimal'
import { EChartsContext, EChartsOptions } from '../types'
import { pickEChartsGlobalOptions, tinymd5 } from '../utils'
import { getMeasurePaletteVisualMap } from '../components/visualMap'

use([MapChart])

const registerMaps: Record<string, Observable<any>> = {}

let d3Geo
let d3GeoProjection
export async function mapChartAnnotation(chartAnnotation: ChartAnnotation): Promise<ChartAnnotation> {
  const chartType = { ...chartAnnotation.chartType }
  if (!isChartMapType(chartType)) {
    throw new Error(`It's not supposed to be here: Not a Map type`)
  }

  if (chartType.mapUrl) {
    const topoVariantSuffix = `${chartType.features ?? ''}${chartType.mesh ?? ''}`
    const variant = tinymd5(chartType.mapUrl + (chartType.isTopoJSON ? topoVariantSuffix : ''), 5)
    const mapType = chartType.map + '-' + variant

    if (!registerMaps[mapType]) {
      registerMaps[mapType] = fromFetch(chartType.mapUrl, {
        selector: (res) => res.json()
      }).pipe(
        tap(async (result) => {
          // is TopoJSON
          if (chartType.isTopoJSON) {
            const geoJson = { type: "FeatureCollection", features: []}
            const topojson = await import('topojson-client')
            chartType.features?.split(',').forEach((feature) => {
              const {features} = topojson.feature(result, result.objects[feature]) as any
              geoJson.features.push(...features)
            })
            if (chartType.mesh) {
              chartType.mesh?.split(',').forEach((meshName) => {
                const mesh = topojson.mesh(result, result.objects[meshName])
                geoJson.features.push({
                  type: 'Feature',
                  geometry: mesh
                })
              })
            }

            registerMap(mapType, geoJson as any)
          } else {
            // is GeoJSON
            registerMap(mapType, result)
          }
        }),
        shareReplay(1)
      )
    }

    await firstValueFrom(registerMaps[mapType])

    chartType.map = mapType
  }

  if (chartType.projection) {
    d3Geo = await import('d3-geo')
    d3GeoProjection = await import('d3-geo-projection')
  }

  return {
    ...chartAnnotation,
    chartType
  }
}

export function mapChart(
  queryReturn: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  const context = {
    data: queryReturn,
    entityType,
    settings,
    options,
    chartAnnotation,
  }
  const chartType = { ...chartAnnotation.chartType }
  if (!isChartMapType(chartType)) {
    throw new Error(`It's not supposed to be here: Not a Map type`)
  }

  const chartCategory = getChartCategory(chartAnnotation)
  const chartCategoryName = getPropertyHierarchy(chartCategory)
  const chartCategoryCaption = getDimensionMemberCaption(chartCategory, entityType)
  const chartMeasure = chartAnnotation.measures[0]
  const chartMeasureName = getPropertyMeasure(chartMeasure)

  const seriesComponents = measuresToSeriesComponents(
    chartAnnotation.measures,
    queryReturn.data,
    entityType,
    settings
  )

  let projection
  if (chartType.projection) {
    try {
      projection = d3Geo['geo' + chartType.projection]()
    } catch (err) {
      try {
        projection = d3GeoProjection['geo' + chartType.projection]()
      } catch (err) {
        throw new Error(`Can't find the projection '${chartType.projection}' in 'd3-geo' and 'd3-geo-projection' lib`)
      }
    }
  }

  const visualMaps = []
  const series = seriesComponents.map((seriesComponent) => {
    let data
    if (seriesComponent.shapeType) {
      const latName = getPropertyName(
        chartAnnotation.dimensions.find((item) => item.role === ChartDimensionRoleType.Lat)
      )
      const longName = getPropertyName(
        chartAnnotation.dimensions.find((item) => item.role === ChartDimensionRoleType.Long)
      )
      data = queryReturn.data.map((item) => ({
        name: item[chartCategoryCaption ?? chartCategoryName],
        value: [item[longName], item[latName], item[chartMeasureName] ?? '-']
      }))
    } else {
      data = queryReturn.data.map((item) => ({
        id: item[chartCategoryName],
        name: item[chartCategoryCaption],
        value: item[chartMeasureName] ?? '-'
      }))
    }

    const nameMap = {}
    // queryReturn.data.forEach((item) => nameMap[item[chartCategoryName]] = item[chartCategoryCaption])

    const _series = {
      id: seriesComponent.id,
      name: (seriesComponent.name ?? seriesComponent.measure),
      type: seriesComponent.shapeType ?? 'map',
      // coordinateSystem: 'geo',
      // 暂时只支持一个 geo 组件
      geoIndex: 0,
      emphasis: {
        label: {
          show: true
        }
      },
      data,
      universalTransition: settings?.universalTransition,
      // 这里的 tooltip 没起作用 ?
      // tooltip: mergeOptions({
      //   trigger: 'item',
      //   showDelay: 0,
      //   transitionDuration: 0.2,
      //   // valueFormatter: (value: number | string) => formatMeasureNumber({measure: seriesComponent, property: seriesComponent.property}, value, settings?.locale)
      // }, options?.tooltip)
    }

    visualMaps.push(getMeasurePaletteVisualMap(
      assignDeepOmitBlank(
        {
          palette: {
            name: 'BrBG'
          }
        },
        seriesComponent
      ),
      queryReturn.data,
      seriesComponent.property)
    )

    return assignDeepOmitBlank(_series, options?.seriesStyle, Number.MAX_SAFE_INTEGER)
  })

  // Geo coordinate system
  const geo = assignDeepOmitBlank({
      map: chartType.map,
      projection: projection
        ? {
            project: (point) => {
              return projection(point)
            },
            unproject: (point) => {
              return projection.invert(point)
            }
          }
        : null,
      roam: true,
      emphasis: {
        label: {
          show: true
        }
      }
    },
    options?.geo,
    Number.MAX_SAFE_INTEGER
  )

  const echartsOptions = {
    geo,
    visualMap: visualMaps, // .map((item, index) => assignDeepOmitBlank(item, options?.visualMaps?.[index], Number.MAX_SAFE_INTEGER)),
    tooltip: assignDeepOmitBlank({
      trigger: 'item',
      showDelay: 0,
      transitionDuration: 0.2,
      valueFormatter: (value: number | string) => seriesComponents[0] ? 
        formatMeasureNumber({measure: seriesComponents[0], property: seriesComponents[0].property}, value, settings?.locale)
        : formatNumber(Number(value), settings?.locale)
    }, options?.tooltip, Number.MAX_SAFE_INTEGER),
    series,
  }

  return {
    ...context,
    echartsOptions: assignDeepOmitBlank(
      echartsOptions,
      pickEChartsGlobalOptions(options),
      Number.MAX_SAFE_INTEGER
    )
  }
}
