import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartDimensionRoleType,
  ChartSettings,
  cloneDeep,
  EntityType,
  getChartCategory,
  getChartSeries,
  getDimensionMemberCaption,
  getEntityHierarchy,
  getEntityProperty,
  getPropertyHierarchy,
  ISlicer,
  omitBlank,
  QueryReturn
} from '@metad/ocap-core'
import { formatMeasureNumber } from './common'
import { trellisCoordinates, gatherCoordinates } from './coordinates'
import { CoordinateContext, EChartsContext, EChartsOptions, ICoordinateSingleAxis } from './types'

export function themeRiver(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
): EChartsContext {
  // 智能补全信息
  const index = chartAnnotation.dimensions.findIndex((item) => item.role === ChartDimensionRoleType.Stacked)
  if (index === -1) {
    chartAnnotation = cloneDeep(chartAnnotation)
    const dimension = chartAnnotation.dimensions.slice(1).find((item) => !item.role)
    if (dimension) {
      dimension.role = ChartDimensionRoleType.Stacked
    }
  }

  const context: CoordinateContext = {
    data,
    entityType,
    settings,
    options,
    chartAnnotation
  }

  const coordinateDatas = trellisCoordinates(context, 'grid', themeRiverCoordinate)
  return {
    ...context,
    echartsOptions: gatherCoordinates(coordinateDatas, 'themeRiver', options),
    onClick: (event) => {
      console.log(event, chartAnnotation)
      const dimension = getChartSeries(chartAnnotation)
      const slicer: ISlicer = {
        dimension,
        members: [
          {
            key: event.value[3],
            value: event.value[3],
            label: event.value[2],
            caption: event.value[2],
          }
        ]
      }
      return {
        ...event,
        event: event.event?.event,
        slicers: [slicer]
      }
    }
  }
}

/**
 * 未来支持:
 *  1. 基于维度成员的主题河
 *  2. 基于不同度量的主题河
 *
 * @param data
 * @param chartAnnotation
 * @param entityType
 * @param settings
 * @param options
 * @returns
 */
export function themeRiverCoordinate(
  context: EChartsContext,
  data: Array<Record<string, unknown>>
): ICoordinateSingleAxis {
  const { chartAnnotation, entityType, settings, options } = context
  const category = getChartCategory(chartAnnotation)
  // const categoryProperty = getEntityHierarchy(entityType, category)
  const categoryCaption = getDimensionMemberCaption(category, entityType)
  const category2 = getChartSeries(chartAnnotation)
  if (!category2) {
    throw new Error(`Can't find dimension for series`)
  }
  // const category2Hierarchy = getEntityHierarchy(entityType, category2)
  const category2Caption = getDimensionMemberCaption(category2, entityType)
  const measure = chartAnnotation.measures[0]

  const categoryName = getPropertyHierarchy(category)
  const category2Name = getPropertyHierarchy(category2)
  const categoryMembers = new Map<string, string>()
  const category2Members = new Map<string, string>()
  const itemsMap = new Map()
  data.forEach((item) => {
    categoryMembers.set(item[categoryName] as string, item[categoryCaption] as string)
    category2Members.set(item[category2Name] as string, item[category2Caption] as string)
    itemsMap.set(`${item[categoryName]}/${item[category2Name]}`, item)
  })

  const categoryMembersIndex = new Map<number, string>()
  let index = 0
  for (const m1 of categoryMembers.keys()) {
    index++
    categoryMembersIndex.set(index, m1)
  }

  const seriesData = []
  for (const m2 of category2Members.keys()) {
    for (const index of categoryMembersIndex.keys()) {
      const cell = itemsMap.get(`${categoryMembersIndex.get(index)}/${m2}`)
      // put 0 value if can't find cell
      seriesData.push([index, cell?.[measure.measure] ?? 0, category2Members.get(m2), m2])
    }
  }

  const coordinateOptions: ICoordinateSingleAxis = {
    type: 'SingleAxis',
    name: '',
    datasets: [
      {
        series: [
          {
            options: assignDeepOmitBlank(
              assignDeepOmitBlank(
                {
                  data: seriesData
                },
                options?.seriesStyle,
                Number.MAX_SAFE_INTEGER
              ),
              measure.chartOptions?.['seriesStyle'],
              Number.MAX_SAFE_INTEGER
            )
          }
        ]
      }
    ],
    grid: assignDeepOmitBlank({}, options?.grid),
    singleAxis: [
      assignDeepOmitBlank(
        {
          // type: 'category',
          axisLabel: {
            formatter: (value, index) => {
              return `${categoryMembers.get(categoryMembersIndex.get(value)) ?? ''}`
            }
          },
          axisPointer: {
            animation: true,
            label: {
              show: true,
              formatter: (params, index) => {
                return `${categoryMembers.get(categoryMembersIndex.get(params.value)) ?? ''}`
              }
            }
          },
          max: 'dataMax'
        },
        options?.singleAxis
      )
    ],
    // visualMap: [],
    tooltip: [],
    legend: []
  }

  if (options?.legend) {
    coordinateOptions.legend.push(omitBlank(options.legend))
  }

  if (options?.tooltip) {
    coordinateOptions.tooltip.push(
      assignDeepOmitBlank(
        {
          valueFormatter: (value) =>
            formatMeasureNumber(
              { measure, property: getEntityProperty(entityType, measure.measure) },
              value,
              settings?.locale
            )
        },
        options.tooltip
      )
    )
  }

  return coordinateOptions
}
