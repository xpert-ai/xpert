import {
  ChartAnnotation,
  ChartDimension,
  ChartDimensionRoleType,
  ChartMeasure,
  ChartMeasureRoleType,
  ChartOptions,
  ChartSettings,
  EntityType,
  getChartCategory,
  getChartSeries,
  getDimensionMemberCaption,
  getEntityProperty,
  getPropertyHierarchy,
  getPropertyMeasure,
  IMember,
  OrderDirection
} from '@metad/ocap-core'
import { lowerCase, maxBy, minBy, orderBy, sortBy, sum, uniqBy } from 'lodash-es'
import { axisOrient } from './components/axis'
import { getEChartsMatrixTooltip } from './components/tooltip'
import { IDataset, SeriesComponentType, totalMeasureName } from './types'

/**
 * 使用 ChartAnnotation 中的 series dimension 将一维数组数据转换成二维数组数据, 然后放在 ECharts 的 DateSet 中, 然后给 stack series 等使用.
 * Capacities:
 * * Calculate two-dimensional array for DateSet
 * * Calculate ECharts component config for series of category2 dimension members
 * * Tooltip ?
 *
 * @param results
 * @param measure
 * @param chartAnnotation
 * @param entityType
 * @param settings
 * @param options
 * @returns
 */
export function stackedForMeasure(
  data: Array<unknown>,
  measure: ChartMeasure,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings?: ChartSettings,
  options?: ChartOptions
): IDataset {
  // The first dimension for two-dimensional array DataSet
  const category = getChartCategory(chartAnnotation)
  // The second dimension for two-dimensional array DataSet
  const category2 = getChartSeries(chartAnnotation)

  // The measure of cell data for two-dimensional array DataSet
  const measureProperty = getEntityProperty(entityType, measure)

  const { categoryValues, category2Values, source, dataMin, dataMax } = getMatrixForMeasure(
    data,
    entityType,
    category,
    category2,
    measure
  )
  const [categoryAxis, valueAxis] = axisOrient(chartAnnotation.chartType.orient)
  const seriesComponents = category2Values.map((category2Value) => {
    const valueAxisIndex = measure.role === ChartMeasureRoleType.Axis2 ? 1 : 0
    return {
      ...measure,
      member: category2Value,
      id: category2Value.key + measure.measure,
      name: category2Value.caption + measure.measure,
      caption: category2Value.caption,
      property: measureProperty,
      measure: getPropertyMeasure(measure),
      formatting: measure.formatting,
      seriesStack: (
        category2.role
          ? category2.role === ChartDimensionRoleType.Stacked
          : chartAnnotation.chartType.variant === 'stacked'
      )
        ? getPropertyMeasure(measure)
        : null,
      seriesLayoutBy: 'row',
      valueAxisIndex,
      dataMin,
      dataMax,
      dataSize: data.length,
      visualMapDimension: category2Value.value
    } as SeriesComponentType
  })

  const categoryValueTexts = new Map()
  categoryValues.forEach(({ value, caption }) => categoryValueTexts.set(value, caption))
  const category2ValueTexts = new Map()
  category2Values.forEach(({ value, caption }) => category2ValueTexts.set(value, caption))
  const tooltip = getEChartsMatrixTooltip(
    options?.tooltip,
    getChartCategory(chartAnnotation),
    category2,
    categoryAxis,
    valueAxis,
    categoryValueTexts,
    category2ValueTexts,
    seriesComponents,
    settings
  )

  return {
    dataset: {
      id: getDatasetIdForMeasure(getPropertyMeasure(measure)),
      source,
      measure: getPropertyMeasure(measure),
      categories: categoryValues,
      series: category2Values
    },
    seriesComponents,
    tooltip
  }
}

/**
 * 将一维数组 items 按照 category 和 category2 维度, 与 measure 为单元格转换成二位数组
 *
 * Capacities:
 * * Sort category dimension by member key and order in dimension
 * * Sort category2 dimension by cell measure value of category last member column and order in measure
 *
 * @param items
 * @param entityType
 * @param category
 * @param category2
 * @param measure
 * @returns
 */
export function getMatrixForMeasure(
  items: Array<unknown>,
  entityType: EntityType,
  category: ChartDimension,
  category2: ChartDimension,
  measure: ChartMeasure
) {
  const categoryName = getPropertyHierarchy(category)
  const category2Name = getPropertyHierarchy(category2)
  const categoryTextName = getDimensionMemberCaption(category, entityType)
  const category2TextName = getDimensionMemberCaption(category2, entityType)
  const measureName = getPropertyMeasure(measure)

  // Itmes key-value 化, 解决使用 lodash find 函数速度问题
  const itemsMap = new Map()
  items.forEach((item) => {
    itemsMap.set(`${item[categoryName]}/${item[category2Name]}`, item)
  })

  let categoryValues = uniqBy(items, categoryName).map(
    (x) =>
      ({
        key: x[categoryName],
        value: x[categoryName],
        label: x[categoryTextName],
        caption: x[categoryTextName]
      } as IMember)
  )
  if (category.order) {
    categoryValues = orderBy(categoryValues, ['value'], [lowerCase(category.order) as 'asc' | 'desc'])
  }
  let category2Values = uniqBy(items, category2Name).map(
    (x) =>
      ({
        key: x[category2Name],
        value: x[category2Name],
        label: x[category2TextName],
        caption: x[category2TextName]
      } as IMember)
  )
  if (measure.order) {
    const lastCategory = categoryValues[categoryValues.length - 1]
    category2Values = sortBy(category2Values, (member) => {
      const item = itemsMap.get(`${lastCategory.key}/${member.key}`)
      if (item) {
        return item[measureName]
      }
      return '-'
    })
    if (measure.order === OrderDirection.DESC) {
      category2Values = category2Values.reverse()
    }
  }

  const dataset = category2Values.map(({ key: category2Value }, i) => {
    const values = categoryValues.map(({ key: categoryValue }) => {
      const item = itemsMap.get(`${categoryValue}/${category2Value}`)
      if (item) {
        return item[measureName]
      }
      return '-'
    })
    return values
  })

  // 最后拼出数据集
  return {
    categoryValues,
    category2Values,
    source: [
      [category2Name, ...categoryValues.map(({ key }) => key)],
      ...category2Values.map(({ key }, i) => [`${key}`, ...dataset[i]]),
      // Total value for measure
      [totalMeasureName(measure.measure), ...categoryValues.map((value, i) => sum(dataset.map((row) => row[i])))]
      // ...(this.settings?.summaries?.map((summary) => [summary.type, ...this.summary(dataset, summary)]) || []),
      // 最后附上一行以 categoryValue 为 key 对应的 item 对象便于用户事件中使用
      // [
      //   '__item__',
      //   ...categoryValues.map((categoryValue) => {
      //     return categoryItems.get(categoryValue)
      //   })
      // ]
    ],
    dataMin: minBy(items, (o) => o[measureName])?.[measureName],
    dataMax: maxBy(items, (o) => o[measureName])?.[measureName]
  }
}

export function getDatasetIdForMeasure(name: string) {
  return `--${name}`
}
