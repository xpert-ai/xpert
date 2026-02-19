import {
  ChartAnnotation,
  ChartMeasureRoleType,
  ChartOrient,
  ChartSettings,
  EntityType,
  QueryReturn,
  _getPropertyCaption,
  getChartCategory,
  getChartSeries,
  getDimensionMemberCaption,
  getEntityProperty,
  isNil,
  omitBlank
} from '@metad/ocap-core'
import { BarChart } from 'echarts/charts'
import { use } from 'echarts/core'
import { includes, sumBy } from 'lodash-es'
import { defaultDigitsInfo, formatMeasureNumber } from './common'
import { axisOrient, getMeasureAxis } from './components/axis'
import { getCoordinateSystem, getPolarCoordinateSystem } from './components/coordinate'
import { measuresToSeriesComponents } from './components/series'
import { gatherCoordinates, trellisCoordinates } from './coordinates'
import { stackedForMeasure } from './stacked'
import {
  AxisEnum,
  CoordinateContext,
  EChartsContext,
  EChartsDataset,
  EChartsOptions,
  ICoordinate,
  IDataset,
  SeriesComponentType,
  isCoordinatePolar,
  totalMeasureName
} from './types'
import { mergeChartOptions } from './utils'
import { formatNumber } from './decimal'

use([BarChart])

const PlaceholderSeriesName = '__placeholder__'

export function waterfallChart(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const [categoryAxis, valueAxis] = axisOrient(chartAnnotation.chartType.orient)
  const context: CoordinateContext = {
    data,
    entityType,
    settings,
    options,
    chartAnnotation,
    categoryAxis,
    valueAxis
  }

  const coordinateDatas = trellisCoordinates(context, 'grid', waterfallCoordinate)

  return {
    ...context,
    echartsOptions: gatherCoordinates(coordinateDatas, 'bar', options)
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
export function waterfallCoordinate(context: EChartsContext, data: Array<Record<string, unknown>>): ICoordinate {
  const { chartAnnotation, entityType, settings, options } = context

  const category = getChartCategory(chartAnnotation)
  // const categoryProperty = getEntityHierarchy(entityType, category)
  const categoryCaption = getDimensionMemberCaption(category, entityType)
  const chartSeries = getChartSeries(chartAnnotation)

  let datasets: IDataset[] = []
  if (chartSeries) {
    datasets = chartAnnotation.measures
      .filter(
        ({ role }) =>
          !includes([ChartMeasureRoleType.Tooltip, ChartMeasureRoleType.Size, ChartMeasureRoleType.Lightness], role)
      )
      .map((measure) => stackedForMeasure(data, measure, chartAnnotation, entityType, settings, options))
  } else {
    const seriesComponents = measuresToSeriesComponents(chartAnnotation.measures, data, entityType, settings)
    data = data.map((row) => ({ ...row }))
    // Fill up measure null value
    if (data[0]) {
      data[0] = { ...data[0] }
      chartAnnotation.measures.forEach((measure) => {
        const totalName = totalMeasureName(measure.measure)
        const totalValue = sumBy(data, measure.measure)
        data.forEach((row) => (row[totalName] = totalValue))
        if (isNil(data[0][measure.measure])) {
          data[0][measure.measure] = '-'
        }
      })
    }

    datasets = [
      {
        dataset: {
          source: data
        },
        seriesComponents
      }
    ]
  }

  context.datasets = datasets

  const type = chartAnnotation.chartType.variant === 'polar' ? 'Polar' : 'Cartesian2d'
  const { categoryAxis, valueAxis } =
    type === 'Polar'
      ? getPolarCoordinateSystem(context, data, settings.locale)
      : getCoordinateSystem(context, data, settings.locale)

  const gridOptions: ICoordinate = {
    type,
    name: '',
    grid: mergeChartOptions(
      {
        containLabel: true
      },
      [],
      options?.grid
    ),
    [categoryAxis.orient]: categoryAxis.axis.map((axis) => ({
      ...axis,
      data: data.map((row) => row[categoryCaption])
    })),
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

  if (isCoordinatePolar(gridOptions)) {
    gridOptions.polar = mergeChartOptions({}, [], options?.polar)
  }

  context.datasets.forEach(({ dataset, seriesComponents }) => {
    gridOptions.datasets.push({
      dataset,
      series: waterfallSeriesComponent(context, dataset, seriesComponents, valueAxis)
    })
  })

  const measure = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
  gridOptions.tooltip.push({
    ...omitBlank(options.tooltip),
    trigger: 'axis',
    axisPointer: {
      type: 'shadow'
    },
    formatter: function (params) {
      let tar
      if (params[1] && params[1].value !== '-') {
        tar = params[1]
      } else {
        tar = params[2]
      }
      return (
        tar &&
        tar.name +
          '<br/>' +
          tar.seriesName +
          ' : ' +
          formatMeasureNumber({ measure, property: null }, tar.value, settings.locale, measure.formatting?.shortNumber)
      )
    }
  })

  // legend
  if (options?.legend) {
    const data = []
    gridOptions.datasets.forEach(({ series }) => {
      series.forEach(({options}) => {
        if (options.name && options.name !== PlaceholderSeriesName) {
          data.push(options.name)
        }
      })
    })
    gridOptions.legend.push(
      mergeChartOptions(
        {
          data
        },
        [],
        options.legend
      )
    )
  }

  return gridOptions
}

export function waterfallSeriesComponent(
  context: EChartsContext,
  dataset: EChartsDataset,
  seriesComponents: SeriesComponentType[],
  valueAxis: {orient: AxisEnum },
) {
  const { chartAnnotation, entityType, settings, options } = context
  const { chartType } = chartAnnotation

  const data = dataset.source
  const seriesStyle = (<EChartsOptions>seriesComponents[0].chartOptions)?.seriesStyle ?? {}
  const { accumulate } = seriesStyle
  const { measure } = seriesComponents[0]
  const property = getEntityProperty(entityType, measure)
  const caption = _getPropertyCaption(property) || measure

  const digitsInfo = defaultDigitsInfo(seriesComponents[0])

  // 以 category 为维度, 以 measure 为度量将 data 计算为 waterfall echarts series 所需的数据结构, 度量值为正数时为收入, 为负数时为支出
  let total = 0
  const seriesData = data.reduce((acc, item, i) => {
    if (accumulate) {
      const increase = item[measure]
      total += increase
      acc.total.push(total)
      acc.positive.push(increase > 0 ? increase : '-')
      acc.negative.push(increase < 0 ? -increase : '-')
      return acc
    }

    const increase = item[measure] - total
    acc.positive.push(increase > 0 ? increase : '-')
    acc.negative.push(increase < 0 ? -increase : '-')

    if (i > 0) {
      if (increase < 0) {
        total += increase
      }
      acc.total.push(total)
    }
    if (increase > 0) {
      total = item[measure]
    }
    return acc
  }, {
    total: [0],
    positive: [],
    negative: []
  })
  const series = [
    {
      name: PlaceholderSeriesName,
      type: 'bar',
      stack: 'Total',
      silent: true,
      itemStyle: {
        borderColor: 'transparent',
        color: 'transparent'
      },
      emphasis: {
        itemStyle: {
          borderColor: 'transparent',
          color: 'transparent'
        }
      },
      data: seriesData.total.splice(0, data.length)
    },
    {
      ...mergeChartOptions({
        label: {
          show: true,
          position: chartType.orient === ChartOrient.horizontal ? 'right' : 'top',
          formatter: (params) => {
            return formatNumber(params.value, settings?.locale, digitsInfo)
          }
        },
      }, [], options?.seriesStyle, seriesStyle),
      name: caption + ' (+)',
      type: 'bar',
      stack: 'Total',
      data: seriesData.positive
    },
    {
      ...mergeChartOptions({
        label: {
          show: true,
          position: chartType.orient === ChartOrient.horizontal ? 'left' : 'bottom',
          formatter: (params) => {
            return formatNumber(params.value, settings?.locale, digitsInfo)
          }
        }
      }, [], options?.seriesStyle, seriesStyle),
      name: caption + ' (-)',
      type: 'bar',
      stack: 'Total',
      data: seriesData.negative
    }
  ]

  return series.map((item) => {
    return {
      options: item,
      visualMaps: [],
    }
  })
}
