import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartDimension,
  ChartMeasure,
  ChartMeasureRoleType,
  compact,
  EntityType,
  formatting,
  getEntityProperty,
  Property,
  PropertyMeasure
} from '@metad/ocap-core'
import { maxBy, minBy, range } from 'lodash-es'
import { getChromaticScale } from '../chromatics'
import { EChartsDataset, IVisualMap } from '../types'

export function getColorLightnessVisualMap(
  measure: ChartMeasure,
  property: Property,
  dataset: EChartsDataset,
  visualMaps?: IVisualMap[]
) {
  const _dataset = Array.isArray(dataset) ? dataset[0] : dataset
  const dataMin = minBy(_dataset.source, measure.measure)?.[measure.measure]
  const dataMax = maxBy(_dataset.source, measure.measure)?.[measure.measure]

  return {
    dimension: _dataset.dimensions ? _dataset.dimensions.indexOf(measure.measure) : measure.measure,
    min: dataMin,
    max: dataMax,
    text: [property.caption || property.name],
    formatter: (value) => {
      return formatting(value, measure.formatting)
    }
  }
}

/**
 * Calc visualMap component for dimension
 *
 * @param dimension
 * @param chartAnnotation
 */
export function dimensionVisualMaps(
  dimension: ChartDimension,
  chartAnnotation: ChartAnnotation,
  dataset: EChartsDataset,
  entityType: EntityType
) {
  const { measures } = chartAnnotation
  const visualMaps = []
  measures.forEach((chartMeasure) => {
    if ([ChartMeasureRoleType.Size, ChartMeasureRoleType.Lightness, ChartMeasureRoleType.SizeLightness].includes(chartMeasure.role)) {
      visualMaps.push(
        getSymbolSizeVisualMap(chartMeasure, getEntityProperty<PropertyMeasure>(entityType, chartMeasure), dataset)
      )
    } else if (chartMeasure.palette) {
      visualMaps.push(
        getMeasurePaletteVisualMap(
          chartMeasure,
          dataset.source,
          getEntityProperty<PropertyMeasure>(entityType, chartMeasure)
        )
      )
    }
  })

  return compact(visualMaps)
}

export function getMeasurePaletteVisualMap(chartMeasure: ChartMeasure, data: any[], property: PropertyMeasure) {
  if (!chartMeasure?.palette) {
    return null
  }

  const { measure, palette, domain } = chartMeasure

  const dataMin = minBy(data, measure)?.[measure]
  const dataMax = maxBy(data, measure)?.[measure]
  const dataSize = data.length

  const _domain = domain || [dataMin, dataMax]

  const inRange = { color: [] }
  if (palette?.colors) {
    inRange.color = palette.colors
  } else if (palette?.name) {
    const colorFun: any = getChromaticScale(palette.name, [0, dataSize - 1], palette.reverse)
    inRange.color = range(dataSize).map((i) => colorFun(i))
  } else {
    return null
  }

  return assignDeepOmitBlank(
    {
      show: false,
      type: 'continuous',
      text: [property.caption || property.name],
      min: _domain[0],
      max: _domain[1],
      dimension: measure,
      inRange,
      formatter: (value) => {
        return formatting(value, chartMeasure.formatting)
      }
    },
    chartMeasure.chartOptions?.visualMap,
    Number.MAX_SAFE_INTEGER
  )
}


/**
 * 为 ChartMeasure 生成 visualMap: 1. size 2. colorLightness 3. colors
 * 
 * @param measure 
 * @param property 
 * @param dataset 
 * @returns 
 */
export function getSymbolSizeVisualMap(measure: ChartMeasure, property: Property, dataset: EChartsDataset) {
  // 原来为什么注释掉, 是不是因为 dataset 情况变化
  const _dataset = Array.isArray(dataset) ? dataset[0] : dataset
  const dataMin = minBy(_dataset.source, measure.measure)?.[measure.measure]
  const dataMax = maxBy(_dataset.source, measure.measure)?.[measure.measure]

  const inRange: any = {}
  const outOfRange: any = {}
  const controller: any = {}
  if (measure.role === ChartMeasureRoleType.Size || measure.role === ChartMeasureRoleType.SizeLightness) {
    inRange.symbolSize = [10, 70]
    outOfRange.symbolSize = [10, 70]
    controller.symbolSize = [10, 70]
  }
  if (measure.role === ChartMeasureRoleType.Lightness || measure.role === ChartMeasureRoleType.SizeLightness) {
    inRange.colorLightness = [0.9, 0.5]
    outOfRange.colorLightness = [1]
    controller.colorLightness = [0.9, 0.5]
  }
  if (measure.palette?.colors?.length) {
    inRange.color = measure.palette.colors
    outOfRange.color = ['grey']
    controller.color = measure.palette.colors
  }

  return assignDeepOmitBlank(
    {
      dimension: _dataset.dimensions ? _dataset.dimensions.indexOf(measure.measure) : measure.measure,
      min: dataMin,
      max: dataMax,
      calculable: true,
      precision: 0.1,
      text: [property.caption || property.name],
      textGap: 30,
      inRange,
      outOfRange,
      controller,
      formatter: (value) => {
        return formatting(value, measure.formatting)
      }
    },
    measure.chartOptions?.visualMap,
    Number.MAX_SAFE_INTEGER
  )
}
