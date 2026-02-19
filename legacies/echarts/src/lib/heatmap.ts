import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartDimension,
  ChartDimensionRoleType,
  ChartOrient,
  ChartSettings,
  cloneDeep,
  EntityType,
  getChartCategory,
  getChartCategory2,
  getEntityHierarchy,
  getEntityLevel,
  getEntityProperty,
  getPropertyHierarchy,
  mergeOptions,
  QueryReturn,
  isEmpty,
  isNil,
  ChartMeasure,
  getDimensionMemberCaption,
} from '@metad/ocap-core'
import { parse, format, isDate } from 'date-fns'
import { HeatmapChart } from 'echarts/charts'
import { use } from 'echarts/core'
import { maxBy, minBy } from 'lodash-es'
import { formatMeasureNumber } from './common'
import { trellisCoordinates, gatherCoordinates } from './coordinates'
import { getEChartsTooltip } from './components/tooltip'
import { AxisEnum, CoordinateContext, EChartsContext, EChartsOptions, ICoordinate, ICoordinateCalendar } from './types'
import { getMeasurePaletteVisualMap } from './components/visualMap'
import { getCoordinateSystem } from './components/coordinate'
import { measuresToSeriesComponents, serializeSeriesComponent } from './components/series'

use([HeatmapChart])

export function heatmap(
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

  const type = 'heatmap'

  if (chartAnnotation.chartType.variant === 'calendar') {
    const calendar = getChartCalendar(chartAnnotation, entityType)
    return {
      ...context,
      echartsOptions: gatherCoordinates(trellisCoordinates(context, 'grid', calendarCoordinate), type, options),
      // onClick: (event) => {
      //   return {
      //     ...event,
      //     event: event.event?.event,
      //     slicers: [{
      //       dimension: calendar,
      //       members: [
      //         event.data.member
      //       ]
      //     }]
      //   }
      // }
    }
  }

  const coordinateDatas = trellisCoordinates(context, 'grid', cartesianCoordinate)

  return {
    ...context,
    echartsOptions: gatherCoordinates(coordinateDatas, type, options),
  }
}

/**
 * 单个笛卡尔坐标系, 对应一个 grid 内的组件
 *
 * @param data 数据数组
 * @param chartAnnotation 图形注解
 * @param entityType 实体类型
 * @param settings 图形设置
 * @param options 图形属性
 * @returns
 */
export function cartesianCoordinate(context: EChartsContext, data: Array<Record<string, unknown>>): ICoordinate {
  // 智能补全信息
  const index = context.chartAnnotation.dimensions.findIndex((item) => item.role === ChartDimensionRoleType.Category2)
  if (index === -1) {
    context.chartAnnotation = cloneDeep(context.chartAnnotation)
    const dimension = context.chartAnnotation.dimensions.slice(1).find((item) => !item.role)
    if (dimension) {
      dimension.role = ChartDimensionRoleType.Category2
    }
  }

  const { chartAnnotation, entityType, settings, options } = context

  const category = getChartCategory(chartAnnotation)
  // const categoryProperty = getEntityProperty(entityType, category)
  const category2 = getChartCategory2(chartAnnotation)
  // For the moment: support only one measure
  const measure = chartAnnotation.measures?.[0]

  context.datasets = []
  const seriesComponents = measuresToSeriesComponents(chartAnnotation.measures, data, entityType, settings)
  data = [...data]
  // TODO 是不是应该提到所有图形之前 ?
  // Fill up measure null value
  if (data[0]) {
    data[0] = { ...data[0] }
    chartAnnotation.measures.forEach((measure) => {
      if (isNil(data[0][measure.measure])) {
        data[0][measure.measure] = '-'
      }
    })
  }

  context.datasets = [
    {
      dataset: {
        source: data
      },
      seriesComponents,
      tooltip: getEChartsTooltip(
        options?.tooltip,
        category,
        entityType,
        chartAnnotation.measures.map((measure) => ({
          measure,
          property: getEntityProperty(entityType, measure)
        })),
        seriesComponents,
        settings.locale
      )
    }
  ]

  const { categoryAxis, valueAxis } = getCoordinateSystem(context, data, settings.locale)

  const gridOptions: ICoordinate = {
    type: 'Cartesian2d',
    name: '',
    grid: mergeOptions(
      {
        containLabel: true
      },
      options?.grid
    ),
    [categoryAxis.orient]: categoryAxis.axis,
    [valueAxis.orient]: valueAxis.axis,
    // visualMap: [],
    datasets: [],
    tooltip: [],
    legend: [],
    dataZoom: []
  }
  if (categoryAxis.dataZooms) {
    gridOptions.dataZoom.push(...categoryAxis.dataZooms)
  }
  if (valueAxis.dataZooms) {
    gridOptions.dataZoom.push(...valueAxis.dataZooms)
  }

  context.datasets.forEach(({ dataset, seriesComponents, tooltip }) => {
    gridOptions.datasets.push({
      dataset,
      series: seriesComponents.map((seriesComponent) => {
        const { series, visualMaps } = serializeSeriesComponent(
          dataset,
          seriesComponent,
          entityType,
          valueAxis,
          settings,
          options
        )

        const _visualMaps = []
        // Default VisualMap
        if (isEmpty(visualMaps)) {
          _visualMaps.push(
            assignDeepOmitBlank(
              getMeasurePaletteVisualMap(<ChartMeasure>seriesComponent, dataset.source, seriesComponent.property),
              seriesComponent.chartOptions?.visualMap,
              2
            )
          )
        } else {
          _visualMaps.push(...visualMaps)
        }

        if (!isNil(seriesComponent.valueAxisIndex)) {
          series[valueAxis.orient + 'Index'] = seriesComponent.valueAxisIndex
        }
        /**
         * 堆积系列情况下不适用 encode, 使用的应该是 seriesLayoutBy: "row" name: "[Canada]" 与 dataset 中的行数据进行的对应
         */
        if (isNil(series.seriesLayoutBy)) {
          series.encode = {
            [AxisEnum[categoryAxis.orient]]: getPropertyHierarchy(category),
            [AxisEnum[valueAxis.orient]]: category2 ? getPropertyHierarchy(category2) : seriesComponent.measure,
            value: chartAnnotation.measures[0].measure,
            tooltip: seriesComponent.tooltip
          }
        }

        return {
          options: assignDeepOmitBlank(series, options?.seriesStyle, 2),
          visualMaps: _visualMaps
        }
      })
    })
    
  })

  gridOptions.tooltip.push(
    assignDeepOmitBlank(
      {
        valueFormatter: (value: number | string) => {
          return formatMeasureNumber({ measure, property: null }, value, settings.locale, measure.formatting?.shortNumber)
        },
        axisPointer: {
          type: 'cross',
          label: {
            // formatter have no effect 
            // formatter: (params) => {
            // }
          }
        }
      },
      options?.tooltip,
      4
    )
  )

  // legend
  if (options?.legend) {
    gridOptions.legend.push(
      assignDeepOmitBlank(
        {},
        options.legend
      )
    )
  }

  // // Userdefined VisualMaps
  // gridOptions.visualMap = gridOptions.visualMap.map((item, index) => {
  //   return {
  //     ...item,
  //     ...omitBlank(options?.visualMaps?.[index])
  //   }
  // })

  return gridOptions
}

/**
 * Get calendar coordinate options for heatmap
 * 
 * @param context 
 * @param data 
 * @returns 
 */
export function calendarCoordinate(context: EChartsContext, data: Array<Record<string, unknown>>): ICoordinate {
  const { chartAnnotation, entityType, settings, options } = context
  const measure = chartAnnotation.measures[0]

  const calendar = getChartCalendar(chartAnnotation, entityType)
  const calendarHierarchy = getEntityHierarchy(entityType, calendar)
  const calendarCaption = getDimensionMemberCaption(calendar, entityType)
  const dateFormatter = options?.seriesStyle?.dateFormatter
  const calendarLevelProperty = getEntityLevel(entityType, calendar)
  const levelFormatter = calendarLevelProperty.semantics?.formatter

  function formatter(row: any) {
    if (!row) {
      return '-'
    }

    let value = row[calendarCaption]
    // calendar caption 可能会是 Date 类型, 就不用转换了. (only for duckdb ?)
    if (dateFormatter && !isDate(value)) {
      value = parse(value, dateFormatter, new Date())
    }
    // 以 caption 为日期, 是因为 memberKey 中会有重复的年月等信息, 这在格式化时不被允许.
    return dateFormatter ? format(value, 'yyyy-MM-dd') : levelFormatter ?
      format(parse(row[calendarHierarchy.name], levelFormatter, new Date()), 'yyyy-MM-dd')
      : row[calendarCaption]
  }

  const seriesComponents = measuresToSeriesComponents(chartAnnotation.measures, data, entityType, settings)

  const calendarMin = minBy(data, calendarCaption)
  const calendarMax = maxBy(data, calendarCaption)

  const dataset = {
    source: data
  }

  const gridOptions: ICoordinateCalendar = {
    type: 'Calendar',
    name: '',
    datasets: [],
    // visualMap: [],
    grid: {},
    calendar: assignDeepOmitBlank(
      {
        orient: chartAnnotation.chartType.orient === ChartOrient.vertical ? 'vertical' : 'horizontal',
        range: [formatter(calendarMin), formatter(calendarMax)]
      },
      options?.calendar
    ),
    tooltip: [],
    dataZoom: []
  }

  gridOptions.datasets = [
    {
      dataset,
      series: seriesComponents.map((seriesComponent) => {
        const { series } = serializeSeriesComponent(
          dataset,
          seriesComponent,
          entityType,
          null,
          settings,
          options
        )

        series.coordinateSystem = 'calendar'
        series.data = data.map((item) => ({
          value: [
            formatter(item),
            item[measure.measure],
          ],
          data: item,
          slicer: {
            dimension: calendar,
            members: [
              {
                value: item[calendarHierarchy.name],
                label: item[calendarCaption],
                caption: item[calendarCaption],
              }
            ]
          }
        }))

        const visualMaps = []
        /**
         * @todo 不使用 visualMaps 是因为其 visualMap 中有 dimensions 这个在 calendar series 情况下有问题, 还没有找到统一的解决方案
         */
        if (seriesComponent.palette?.colors?.length) {
          const visualMap = getMeasurePaletteVisualMap(<ChartMeasure>seriesComponent, dataset.source, seriesComponent.property)
          visualMaps.push(visualMap)
        } else {
          // Default VisualMap for measure component
          visualMaps.push(
            assignDeepOmitBlank(
              {
                min: seriesComponent.dataMin,
                max: seriesComponent.dataMax,
                text: [seriesComponent.property.caption || seriesComponent.property.name]
              },
              seriesComponent.chartOptions?.visualMap,
              2
            )
          )
        }

        return {
          options: assignDeepOmitBlank(series, options?.seriesStyle),
          visualMaps: visualMaps.map((item) => ({...item, dimension: 1})) // dimension 使用的是 series.data.value 的第二个值
        }
      })
    }
  ]

  gridOptions.tooltip.push(
    assignDeepOmitBlank(
      {
        trigger: 'item',
        valueFormatter: (value: number | string) => {
          return formatMeasureNumber({ measure, property: null }, value, settings.locale, measure.formatting?.shortNumber)
        }
      },
      options?.tooltip
    )
  )

  return gridOptions
}

export function getChartCalendar(chartAnnotation: ChartAnnotation, entityType: EntityType): ChartDimension {
  return chartAnnotation.dimensions.find((item) => {
    const property = getEntityProperty(entityType, item)
    if (property.semantics?.semantic) {
      return true
    }
    return false
  })
}
