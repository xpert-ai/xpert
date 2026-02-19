import {
  ChartAnnotation,
  ChartDimension,
  ChartMeasure,
  ChartSettings,
  EntityType,
  getChartCategory,
  getChartSeries,
  getDimensionMemberCaption,
  getEntityProperty,
  getPropertyHierarchy,
  getPropertyMeasure,
  QueryReturn
} from '@metad/ocap-core'
import { groupBy } from 'lodash-es'
import { formatMeasureNumber } from './common'
import { DEFAULT_GRID } from './components/cartesian2d'
import { getAxisDataZooms } from './components/data-zoom'
import { trellisCoordinates, gatherCoordinates } from './coordinates'
import {
  AxisEnum,
  CoordinateContext,
  EChartsContext,
  EChartsDataset,
  EChartsOptions,
  ICoordinate,
  ICoordinateCartesian2d
} from './types'
import { mergeChartOptions } from './utils'

export function boxplot(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  const context: CoordinateContext = {
    data,
    entityType,
    settings,
    options,
    chartAnnotation
  }
  const pieCoordinates = trellisCoordinates(context, 'grid', boxplotCoordinate)
  return {
    ...context,
    echartsOptions: gatherCoordinates(pieCoordinates, 'boxplot', options)
  }
}

/**
 * 单个散点图笛卡尔坐标系, 对应一个 grid 内的组件
 *
 * 包含对 dimension role 为 series 的处理
 *
 * @param data 数据数组
 * @param chartAnnotation 图形注解
 * @param entityType 实体类型
 * @param settings 图形设置
 * @param options 图形属性
 * @returns
 */
export function boxplotCoordinate(context: EChartsContext, data: Array<unknown>): ICoordinate {
  const { chartAnnotation, entityType, settings, options } = context
  const category = getChartCategory(chartAnnotation)
  if (!category) {
    throw new Error(`No category dimension`)
  }

  const category2 = getChartSeries(chartAnnotation)
  if (!category2) {
    throw new Error(`No series dimension`)
  }

  const measure = chartAnnotation.measures[0]
  if (!measure) {
    throw new Error(`No measure`)
  }

  const { source, categories } = prepareBoxplotDataSource(entityType, category, measure, data)
  const cc2d = {
    type: 'Cartesian2d',
    name: 'boxplot',
    datasets: [
      {
        dataset: {
          source,
          transforms: [
            {
              transform: {
                type: 'boxplot',
                config: {
                  itemNameFormatter: ({ value }) => {
                    return categories[value]?.caption
                  }
                }
              }
            },
            {
              fromDatasetIndex: 1,
              fromTransformResult: 1
            }
          ]
        } as EChartsDataset,
        series: [
          {
            options: mergeChartOptions(
              {
                id: 'boxplot',
                type: 'boxplot',
                datasetIndex: 1,
                tooltip: {
                  trigger: 'item',
                  axisPointer: {
                    type: 'shadow'
                  }
                }
              },
              [],
              options?.seriesStyle,
              (<EChartsOptions>measure.chartOptions)?.seriesStyle
            )
          },
          {
            options: mergeChartOptions(
              {
                id: 'outlier',
                name: 'outlier',
                type: 'scatter',
                datasetIndex: 2,
                tooltip: {
                  trigger: 'item',
                  axisPointer: {
                    type: 'shadow'
                  }
                }
              },
              [],
              options?.seriesStyle,
              (<EChartsOptions>measure.chartOptions)?.seriesStyle
            )
          }
        ]
      }
    ],
    grid: mergeChartOptions({...DEFAULT_GRID}, [], options?.grid),
    xAxis: [mergeChartOptions({ type: 'category' }, [], options?.categoryAxis, category.chartOptions?.axis)],
    yAxis: [
      mergeChartOptions(
        {
          type: 'value',
          axisLabel: {
            formatter: (value, index: number) =>
              formatMeasureNumber(
                { measure, property: getEntityProperty(entityType, measure) },
                value,
                settings?.locale
              )
          }
        },
        [],
        options?.valueAxis,
        measure.chartOptions?.axis
      )
    ],

    dataZoom: [...getAxisDataZooms(category, AxisEnum.x), ...getAxisDataZooms(measure, AxisEnum.y)],

    tooltip: [
      {
        trigger: 'item',
        axisPointer: {
          type: 'shadow'
        }
      }
    ]
  } as ICoordinateCartesian2d

  return cc2d
}

export function prepareBoxplotDataSource(
  entityType: EntityType,
  category: ChartDimension,
  measure: ChartMeasure,
  data: any[]
) {
  const categoryName = getPropertyHierarchy(category)
  const categoryCaption = getDimensionMemberCaption(category, entityType)
  const categoryMembers = groupBy(data, categoryName)
  const measureName = getPropertyMeasure(measure)

  // Has order index
  const categories = Object.keys(categoryMembers).map((key) => ({
    key,
    caption: categoryMembers[key][0]?.[categoryCaption]
  }))

  return {
    source: Object.keys(categoryMembers).map((key) => categoryMembers[key].map((item) => item[measureName])),
    categories
  }
}
