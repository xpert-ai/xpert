import { ChartMeasureRoleType, ChartOrient, getChartCategory, getChartCategory2, getEntityHierarchy } from "@metad/ocap-core"
import { axisOrient, getCategoryAxis, getMeasureAxis, getValueAxis } from "./axis"
import { AxisEnum, EChartsContext } from "../types"
import { getAxisDataZooms } from "./data-zoom"
import { instantiateI18n } from "../i18n"

/**
 * @todo Coordinate system should use x y z identifying axis
 * 
 * @param chartAnnotation
 * @param entityType
 * @param items
 * @param chartOptions
 * @param locale
 * @returns
 */
export function getCoordinateSystem(context: EChartsContext, items: Array<unknown>, locale: string) {
  const { chartAnnotation, entityType, options: chartOptions } = context

  const measure = chartAnnotation.measures.find(
    (item) => !item.role || item.role === ChartMeasureRoleType.Axis1
  )?.measure
  const [categoryOrient, valueOrient] = axisOrient(chartAnnotation.chartType.orient)

  const category = getChartCategory(chartAnnotation)
  const category2 = getChartCategory2(chartAnnotation)

  /**
   * @deprecated use getCoordinateSystem in scatter file
   */
  if (chartAnnotation.chartType.type === 'Scatter') {
    const axis1 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
    const axis2 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis2, 1)
    const valueAxises = getValueAxis(chartAnnotation, entityType, chartOptions, locale)
    return {
      categoryAxis: { orient: categoryOrient, axis: [valueAxises[0]], dataZooms: getAxisDataZooms(axis1, AxisEnum.x) },
      valueAxis: { orient: valueOrient, axis: [valueAxises[1]], dataZooms: getAxisDataZooms(axis2, AxisEnum.y) }
    }
  } else {
    if (!category) {
      throw new Error(instantiateI18n(locale, 'Error.CantFoundPrimaryCategory', `Can't found primary category dimension`))
    }

    let valueAxis = null
    // 设置维度轴值
    const categoryAxis = getCategoryAxis(
      context,
      items,
      category,
      getEntityHierarchy(entityType, category),
      chartOptions,
      measure
    )
    categoryAxis.orient = categoryOrient

    if (category2) {
      valueAxis = [
        getCategoryAxis(context, items, category2, getEntityHierarchy(entityType, category2), chartOptions, measure)
      ]
    } else {
      valueAxis = getValueAxis(chartAnnotation, entityType, chartOptions, locale)
    }
    valueAxis.orient = valueOrient

    return {
      categoryAxis: { orient: categoryOrient, axis: [categoryAxis], dataZooms: getAxisDataZooms(category, categoryOrient) },
      valueAxis: {
        orient: valueOrient,
        axis: valueAxis,
        dataZooms: category2 ? getAxisDataZooms(category2, valueOrient) : getAxisDataZooms(chartAnnotation.measures[0], valueOrient)
      }
    }
  }
}

export function getPolarCoordinateSystem(context: EChartsContext, items: Array<unknown>, locale: string) {
  const { chartAnnotation, entityType, options: chartOptions } = context
  const measure = chartAnnotation.measures.find(
    (item) => !item.role || item.role === ChartMeasureRoleType.Axis1
  )?.measure
  const [categoryOrient, valueOrient] = (() => {
    // Chart Orient
    if (chartAnnotation.chartType.orient === ChartOrient.vertical) {
      return [AxisEnum.angle, AxisEnum.radius]
    } else {
      return [AxisEnum.radius, AxisEnum.angle]
    }
  })()

  const category = getChartCategory(chartAnnotation)
  const category2 = getChartCategory2(chartAnnotation)

  let valueAxis = null
  // 设置维度轴值
  const categoryAxis = getCategoryAxis(
    context,
    items,
    category,
    getEntityHierarchy(entityType, category),
    chartOptions,
    measure
  )
  categoryAxis.orient = categoryOrient

  if (category2) {
    valueAxis = [
      getCategoryAxis(context, items, category2, getEntityHierarchy(entityType, category2), chartOptions, measure)
    ]
  } else {
    valueAxis = getValueAxis(chartAnnotation, entityType, chartOptions, locale)
  }
  valueAxis.orient = valueOrient

  return {
    categoryAxis: { orient: categoryOrient, axis: [categoryAxis], dataZooms: null },
    valueAxis: { orient: valueOrient, axis: valueAxis, dataZooms: null }
  }
}
