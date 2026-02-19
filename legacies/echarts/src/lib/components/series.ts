import {
  assign,
  ChartDimension,
  ChartMeasure,
  ChartMeasureRoleType,
  ChartSettings,
  EntityType,
  getEntityProperty,
  getPropertyHierarchy,
  getPropertyMeasure,
  isEmpty,
  isNil,
  nonNullable,
  omitBlank,
  ReferenceLineType,
  ReferenceLineValueType
} from '@metad/ocap-core'
import { includes, maxBy, minBy, range } from 'lodash-es'
import { getLegendColorForVisualMap, getVisualMapValueAxisIndex } from '../cartesian'
import { getChromaticScale } from '../chromatics'
import { formatMeasureNumber } from '../common'
import { DecalPatterns } from '../decal'
import { AxisEnum, EChartsDataset, EChartsOptions, SeriesComponentType } from '../types'
import { mergeChartOptions } from '../utils'
import { getColorLightnessVisualMap, getSymbolSizeVisualMap } from './visualMap'

export function dimensionToSeriesComponent(
  name: string,
  dimension: ChartDimension,
  measures: ChartMeasure[],
  data: any[],
  entityType: EntityType,
  settings: ChartSettings
) {
  const property = getEntityProperty(entityType, dimension)
  const tooltips = measures.filter(({ role }) => role === ChartMeasureRoleType.Tooltip)
  return {
    id: settings?.universalTransition ? getPropertyHierarchy(dimension) : null,
    name: name ?? property.caption ?? property.name,
    label: property?.caption,
    property,
    dataSize: data.length,
    tooltip: tooltips.map(({ measure }) => measure),
    sizeMeasure: measures.find(({ role }) => role === ChartMeasureRoleType.Size),
    lightnessMeasure: measures.find(({ role }) => role === ChartMeasureRoleType.Lightness)
  } as SeriesComponentType
}

export function measuresToSeriesComponents(
  measures: ChartMeasure[],
  data: any[],
  entityType: EntityType,
  settings: ChartSettings
): SeriesComponentType[] {
  const tooltips = measures.filter(({ role }) => role === ChartMeasureRoleType.Tooltip)
  const _measures = measures.filter(
    ({ role }) =>
      !includes([ChartMeasureRoleType.Tooltip, ChartMeasureRoleType.Size, ChartMeasureRoleType.Lightness], role)
  )

  return _measures.map((measure) => {
    const measureName = getPropertyMeasure(measure)
    const measureProperty = getEntityProperty(entityType, measure)
    const valueAxisIndex = measure.role === ChartMeasureRoleType.Axis2 ? 1 : 0
    const dataNotNull = data.filter((item) => !isNil(item[measureName]))
    const minItem = minBy(dataNotNull, measureName)
    const maxItem = maxBy(dataNotNull, measureName)
    return {
      ...measure,
      id: getPropertyMeasure(measure),
      name: measureProperty?.caption,
      label: measureProperty?.caption,
      seriesType: measure.shapeType,
      property: measureProperty,
      dataMin: minItem?.[measureName],
      dataMax: maxItem?.[measureName],
      dataSize: data.length,
      valueAxisIndex,
      tooltip: tooltips.map(({ measure }) => measure),
      sizeMeasure: measures.find(({ role }) => role === ChartMeasureRoleType.Size),
      lightnessMeasure: measures.find(({ role }) => role === ChartMeasureRoleType.Lightness)
    } as SeriesComponentType
  })
}

/**
 * Serialize measure to echarts series component options
 *
 * @param dataset
 * @param seriesComponent
 * @param entityType
 * @param valueAxis
 * @param settings
 * @param options
 * @returns
 */
export function serializeSeriesComponent(
  dataset: EChartsDataset,
  seriesComponent: SeriesComponentType,
  entityType: EntityType,
  valueAxis,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const visualMaps = []

  const series: any = {
    member: seriesComponent.member,
    id: seriesComponent.id,
    name: seriesComponent.name ?? seriesComponent.id,
    caption: seriesComponent.caption,
    type: seriesComponent.seriesType,
    measure: seriesComponent.measure,
    datasetIndex: seriesComponent.datasetIndex,
    seriesLayoutBy: seriesComponent.seriesLayoutBy,
    stack: seriesComponent.seriesStack,
    universalTransition: settings?.universalTransition,
    selectedMode: 'single'
  }

  const visualMap = {
    text: seriesComponent.property?.caption ? [seriesComponent.property?.caption] : null,
    min: Number(seriesComponent.domain?.[0] ?? seriesComponent.dataMin ?? seriesComponent.dataMax ?? 0),
    max: Number(seriesComponent.domain?.[1] ?? seriesComponent.dataMax ?? seriesComponent.dataMin ?? 0)
  }
  if (seriesComponent.palette?.name || seriesComponent.palette?.colors) {
    const inRange: any = {}
    if (seriesComponent.palette.colors) {
      inRange.color = seriesComponent.palette.colors
    } else if (seriesComponent.palette.name) {
      // Min 10 and max 20 colors generate
      const rangeSize = Math.max(Math.min(seriesComponent.dataSize, 20), 10)
      const colorFun = getChromaticScale(
        seriesComponent.palette.name,
        [0, rangeSize - 1],
        seriesComponent.palette.reverse
      )
      inRange.color = range(rangeSize).map((i) => colorFun(i))
    }

    series.color = getLegendColorForVisualMap(inRange.color)

    visualMaps.push(
      mergeChartOptions(
        {
          ...visualMap,
          show: false,
          type: 'continuous',
          inRange,
          dimension: seriesComponent.visualMapDimension ?? getVisualMapValueAxisIndex(dataset, seriesComponent, null)
        },
        [],
        seriesComponent.chartOptions?.visualMap
      )
    )
  } else if (seriesComponent.chartOptions?.visualMap) {
    visualMaps.push({
      ...visualMap,
      ...omitBlank(seriesComponent.chartOptions.visualMap)
    })
  }

  if (!isNil(seriesComponent.palette?.pattern)) {
    series.itemStyle = series.itemStyle ?? {}
    series.itemStyle.decal = DecalPatterns()[seriesComponent.palette.pattern]
  }

  if (!isEmpty(seriesComponent.referenceLines) && valueAxis) {
    assign(series, referenceLines(seriesComponent as ChartMeasure, null, options, valueAxis.orient, settings?.locale))
  }

  if (seriesComponent.sizeMeasure) {
    visualMaps.push(
      mergeChartOptions(
        getSymbolSizeVisualMap(
          seriesComponent.sizeMeasure,
          getEntityProperty(entityType, seriesComponent.sizeMeasure),
          dataset
        ),
        [],
        seriesComponent.sizeMeasure.chartOptions?.visualMap
      )
    )
  }
  if (seriesComponent.lightnessMeasure) {
    const lightnessProperty = getEntityProperty(entityType, seriesComponent.lightnessMeasure)
    visualMaps.push(
      mergeChartOptions(
        getColorLightnessVisualMap(seriesComponent.lightnessMeasure, lightnessProperty, dataset, options?.visualMaps),
        [],
        seriesComponent.lightnessMeasure.chartOptions?.visualMap
      )
    )
  }

  if (options?.seriesStyle?.endLabel?.show) {
    series.endLabel = {
      show: true,
      formatter: (params) => {
        const member = params.seriesId.slice(0, -seriesComponent.measure.length)
        const label = dataset.series.find((item) => item.value === member)?.label
        const index = params.dimensionNames.findIndex((item) => item === member)
        const value = params.value[index + 1]
        return (
          (label ?? member) +
          ': ' +
          formatMeasureNumber({ measure: seriesComponent, property: seriesComponent.property }, value, settings?.locale)
        )
      }
    }
  }

  return {
    series,
    visualMaps
  }
}

export function referenceLines(
  axis1: ChartMeasure,
  axis2: ChartMeasure,
  options: EChartsOptions,
  valueAxis: AxisEnum,
  locale: string
) {
  const formatter = (params: { value: string | number } | Array<any>) => {
    if (Array.isArray(params)) {
      return params
        .map(({ value }) => formatMeasureNumber({ measure: axis1, property: null }, value, locale))
        .join('; ')
    } else {
      return formatMeasureNumber({ measure: axis1, property: null }, params.value, locale)
    }
  }

  const markLine = {
    data: [],
    label: {
      formatter
    }
  }
  const markPoint = {
    data: [],
    label: {
      formatter
    }
  }

  axis1?.referenceLines?.filter((nonNullable)).forEach((referenceLine) => {
    if (referenceLine.type) {
      const referenceLineData = mergeChartOptions(
        {
          name: referenceLine.label,
          // valueIndex: valueAxis === AxisEnum.x ? 0 : 1,
          valueDim: axis1.measure
        },
        [],
        referenceLine.chartOptions
      )

      if (referenceLine.valueType === ReferenceLineValueType.fixed) {
        referenceLineData[valueAxis] = referenceLine.value
      } else if (referenceLine.valueType === ReferenceLineValueType.dynamic) {
        referenceLineData['type'] = referenceLine.aggregation
      }

      if (referenceLine.type === ReferenceLineType.markLine) {
        markLine.data.push(referenceLineData)
      } else if (referenceLine.type === ReferenceLineType.markPoint) {
        markPoint.data.push(referenceLineData)
      }
    }
  })

  axis2?.referenceLines?.forEach((referenceLine) => {
    if (referenceLine.type) {
      const referenceLineData = mergeChartOptions(
        {
          name: referenceLine.label,
          // valueIndex: valueAxis === AxisEnum.y ? 0 : 1,
          valueDim: axis2.measure
        },
        [],
        referenceLine.chartOptions
      )

      if (referenceLine.valueType === ReferenceLineValueType.fixed) {
        referenceLineData[valueAxis] = referenceLine.value
      } else if (referenceLine.valueType === ReferenceLineValueType.dynamic) {
        referenceLineData['type'] = referenceLine.aggregation
      }

      if (referenceLine.type === ReferenceLineType.markLine) {
        markLine.data.push(referenceLineData)
      } else if (referenceLine.type === ReferenceLineType.markPoint) {
        markPoint.data.push(referenceLineData)
      }
    }
  })

  return {
    markLine,
    markPoint
  }
}
