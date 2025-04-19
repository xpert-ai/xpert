import {
  ChartAnnotation,
  ChartDimension,
  ChartMeasureRoleType,
  ChartSettings,
  EntityType,
  getChartCategory,
  getChartCategory2,
  getChartSeries,
  getDimensionMemberCaption,
  getPropertyHierarchy,
  isArray,
  isNil,
  omitBlank,
  QueryReturn
} from '@metad/ocap-core'
import { LinearGradient } from 'echarts/lib/util/graphic'
import {t} from 'i18next'
import { includes, indexOf, sumBy } from 'lodash-es'
import { axisOrient, getMeasureAxis } from './components/axis'
import { formatMeasureNumber } from './common'
import { getCoordinateSystem, getPolarCoordinateSystem } from './components/coordinate'
import { measuresToSeriesComponents, serializeSeriesComponent } from './components/series'
import { trellisCoordinates, gatherCoordinates } from './coordinates'
import { stackedForMeasure } from './stacked'
import {
  AxisEnum,
  CoordinateContext,
  EChartsContext,
  EChartsDataset,
  EChartsOptions,
  ICoordinate,
  IDataset,
  isCoordinatePolar,
  SeriesComponentType,
  totalMeasureName
} from './types'
import { mergeChartOptions } from './utils'

export function cartesian(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions,
  type: string
): EChartsContext {
  const [categoryAxis, valueAxis] = axisOrient(chartAnnotation.chartType.orient)
  const context: CoordinateContext = {
    data,
    entityType,
    settings,
    options,
    chartAnnotation,
    categoryAxis,
    valueAxis,
  }

  const coordinateDatas = trellisCoordinates(context, type === 'pie' ? 'pie' : 'grid', cartesianCoordinate)
  return {
    ...context,
    echartsOptions: gatherCoordinates(coordinateDatas, type, options)
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
  const { chartAnnotation, entityType, settings, options } = context

  let category2: ChartDimension
  let chartSeries: ChartDimension
  let category = getChartCategory(chartAnnotation)
  if (category) {
    category2 = getChartCategory2(chartAnnotation)
    chartSeries = getChartSeries(chartAnnotation)
  } else {
    category = getChartSeries(chartAnnotation)
  }
  if (!category) {
    throw new Error(t('Error.CategoryDimensionNotProvided', {ns: 'echarts'}))
  }
  const categoryMemberCaption = getDimensionMemberCaption(category, entityType)

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
    data = data.map((row) => ({...row}))
    // Fill up measure null value
    if (data[0]) {
      data[0] = { ...data[0] }
      chartAnnotation.measures.forEach((measure) => {
        const totalName = totalMeasureName(measure.measure)
        const totalValue = sumBy(data, measure.measure)
        data.forEach((row) => row[totalName] = totalValue)
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

  if (isCoordinatePolar(gridOptions)) {
    gridOptions.polar = mergeChartOptions({}, [], options?.polar)
  }

  context.datasets.forEach(({ dataset, seriesComponents }) => {
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
            tooltip: seriesComponent.tooltip
          }
          if (!settings?.universalTransition) {
            series.encode.itemName = categoryMemberCaption
          }
        }

        // series.tooltip = tooltip
        /**
         * 解决 valueFormatter 与 formatter 里 member caption 共存的问题:
         * encode.itemName 决定 name, valueFormatter 决定 value.
         */
        series.tooltip = {
          valueFormatter: (value: number | string) => {
            return formatMeasureNumber(
              { measure: seriesComponent, property: seriesComponent.property },
              value,
              settings.locale,
              seriesComponent.formatting?.shortNumber
            )
          }
        }

        return {
          options: mergeChartOptions(series, [], options?.seriesStyle, (<EChartsOptions>seriesComponent.chartOptions)?.seriesStyle),
          visualMaps
        }
      })
    })
  })

  if (options?.tooltip?.trigger === 'axis') {
    const measure = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
    gridOptions.tooltip.push({
      ...omitBlank(options.tooltip),
      trigger: 'axis',
      valueFormatter: (value: number | string) => {
        return formatMeasureNumber({ measure, property: null }, value, settings.locale, measure.formatting?.shortNumber)
      }
    })
  } else {
    gridOptions.tooltip.push({
      ...omitBlank(options?.tooltip),
      trigger: 'item'
    })
  }

  // legend
  if (options?.legend) {
    gridOptions.legend.push(
      mergeChartOptions(
        {
          formatter: (name) => {
            let label = name
            gridOptions.datasets.find(({ series }) =>
              series.find((item) => {
                if (item.options.name === name) {
                  label = item.options.caption
                  return true
                }
                return false
              })
            )
            return label || name
          }
        },
        [],
        options.legend
      )
    )
  }

  return gridOptions
}

/**
 * @deprecated 使用更好的方式, 不能这样推断出来
 *
 * @param dataset
 * @param seriesComponent
 * @param series
 * @returns
 */
export function getVisualMapValueAxisIndex(
  dataset: EChartsDataset,
  seriesComponent: SeriesComponentType,
  series?: ChartDimension
) {
  /**
   * @todo dataset not the type
   */
  if (series && isArray<EChartsDataset>(dataset)) {
    dataset = dataset.find((item) => item.id === `--${seriesComponent.measure}`)
  } else if (isArray(dataset)) {
    dataset = dataset[0]
  }

  /**
   * 推断出按以下顺序获取 dimension of visualMap, but 应该由类型定义出来:
   *
   * 1. Array of object: index of measure
   * 2. Arrray of Array: series member's key
   * 3. measure name
   */
  return dataset.dimensions
    ? indexOf(dataset.dimensions, seriesComponent.measure)
    : seriesComponent.member
    ? seriesComponent.member.value
    : seriesComponent.measure
}

export function getLegendColorForVisualMap(colors) {
  if (colors && colors.length > 2) {
    return new LinearGradient(0, 0, 1, 0, [
      {
        offset: 0,
        color: colors[0]
      },
      {
        offset: 0.5,
        color: colors[Math.floor(colors.length / 2)]
      },
      {
        offset: 1,
        color: colors[colors.length - 1]
      }
    ])
  } else if (colors && colors.length > 1) {
    return new LinearGradient(0, 0, 1, 0, [
      {
        offset: 0,
        color: colors[0]
      },
      {
        offset: 1,
        color: colors[colors.length - 1]
      }
    ])
  } else if (colors && colors.length > 0) {
    return colors[0]
  }
  return undefined
}
