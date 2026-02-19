import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartDimension,
  ChartMeasure,
  ChartMeasureRoleType,
  ChartOrient,
  EntityType,
  getDimensionMemberCaption,
  getEntityHierarchy,
  getEntityProperty,
  PropertyHierarchy,
  PropertyMeasure
} from '@metad/ocap-core'
import { formatMeasureNumber, formatMeasureValue, setCategoryAxisLabel } from '../common'
import { AxisEnum, AxisPointerLabelParams, EChartsContext, EChartsOptions } from '../types'

/**
 * 设置轴方向布局
 *
 * @param orient ChartOrient
 * @return [categoryAxis, valueAxis]
 */
export function axisOrient(orient: ChartOrient): [AxisEnum, AxisEnum] {
  // Chart Orient
  if (orient === ChartOrient.horizontal) {
    return [AxisEnum.y, AxisEnum.x]
  } else {
    return [AxisEnum.x, AxisEnum.y]
  }
}

/**
 * Calc Axis and DataZoom for category dimension
 *
 * @param categoryType Axis Type [ECharts xAxis.type](https://echarts.apache.org/en/option.html#xAxis.type)
 * @param items
 * @param dimension
 * @param categoryProperty
 * @param chartOptions
 * @returns
 */
export function getCategoryAxis(
  context: EChartsContext,
  items: Array<unknown>,
  dimension: ChartDimension,
  categoryProperty: PropertyHierarchy,
  chartOptions: EChartsOptions,
  measure: string,
  categoryType = 'category'
) {
  const { entityType } = context
  const axisPointer = getCategoryAxisPointer(context, items, dimension, measure)
  let categoryAxis: any = {
    type: categoryType,
    axisPointer
  }

  setCategoryAxisLabel(categoryAxis, items, dimension, entityType)

  categoryAxis = assignDeepOmitBlank(categoryAxis, chartOptions?.categoryAxis, 2)

  if (chartOptions?.categoryAxis?.showName) {
    categoryAxis.name = categoryProperty.caption
  }

  return assignDeepOmitBlank(categoryAxis, dimension.chartOptions?.axis, 2)
}

/**
 * 从度量中计算出值轴配置
 *
 * @param chartAnnotation
 * @param entityType
 * @param chartOptions
 * @param locale
 * @returns
 */
export function getValueAxis(
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  chartOptions: EChartsOptions,
  locale?: string
): any {
  const axis1 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
  const axis2 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis2, 1)

  if (!axis1) {
    throw new Error(`需要配置的主度量轴`)
  }

  const axis1Property = getEntityProperty(entityType, axis1)
  let valueAxis: any = {
    type: 'value',
    axisLabel: {
      formatter: (value, index: number) =>
        formatMeasureNumber({ measure: axis1, property: axis1Property }, value, locale)
    }
  }
  if (axis1.chartOptions?.axis?.showName) {
    valueAxis.name = axis1Property.caption
  }

  valueAxis = assignDeepOmitBlank(assignDeepOmitBlank(valueAxis, chartOptions?.valueAxis), axis1.chartOptions?.axis)

  if (axis2) {
    const axis2Property = getEntityProperty(entityType, axis2)
    let valueAxis2 = {
      type: 'value',
      axisLabel: {
        formatter: (value, index: number) =>
          formatMeasureNumber({ measure: axis2, property: axis2Property }, value, locale)
      }
    } as any
    if (axis2.chartOptions?.axis?.showName) {
      valueAxis2.name = axis2Property.caption
    }
    valueAxis2 = assignDeepOmitBlank(assignDeepOmitBlank(valueAxis2, chartOptions?.valueAxis), axis2.chartOptions?.axis)

    return [valueAxis, valueAxis2]
  }

  return [valueAxis]
}

/**
 * Find measure by measure role or index
 *
 * @param chartAnnotation
 * @param role
 * @param index
 * @returns
 */
export function getMeasureAxis(
  chartAnnotation: ChartAnnotation,
  role: ChartMeasureRoleType,
  index: number
): ChartMeasure {
  return (
    chartAnnotation.measures.find((item) => item.role === role) ||
    chartAnnotation.measures.filter((item) => !item.role)?.[index]
  )
}

/**
 *
 * @param category
 * @param items
 * @param property 暂时只支持一个 dimension
 */
export function getCategoryAxisPointer(
  context: EChartsContext,
  items: Array<unknown>,
  category: ChartDimension,
  measure: string
) {
  const { entityType } = context
  const categoryProperty: PropertyHierarchy = getEntityHierarchy(entityType, category)
  const categoryCaption = getDimensionMemberCaption(category, entityType)
  const dataset = context.datasets?.find(({ dataset }) => !dataset.measure || dataset.measure === measure)

  const axisPointer: any = {
    label: {}
  }

  axisPointer.label.formatter = (params: AxisPointerLabelParams) => {
    let label: string
    if (dataset?.dataset.categories) {
      label = dataset.dataset.categories.find((item) => item.value === params.value)?.label
    } else {
      label = items.find((item) => item[categoryProperty.name] === params.value)?.[categoryCaption]
    }
    return label || params.value
  }

  return axisPointer
}

export function valueAxisLabelFormatter(measure: ChartMeasure, property: PropertyMeasure, value: any, locale?: string) {
  const { value: digitsNumber, shortUnit } = formatMeasureValue(measure, property, value, locale)
  return shortUnit ? `${digitsNumber}${shortUnit}` : digitsNumber
}
