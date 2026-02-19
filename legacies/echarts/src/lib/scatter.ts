import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartMeasureRoleType,
  ChartSettings,
  EntityType,
  FilteringLogic,
  getChartCategory,
  getChartSeries,
  getDimensionMemberCaption,
  getEntityHierarchy,
  getEntityProperty,
  getPropertyHierarchy,
  omitBlank,
  QueryReturn
} from '@metad/ocap-core'
import { assign, isEmpty, isNil, uniqBy } from 'lodash-es'
import { formatMeasureNumber } from './common'
import { axisOrient, getMeasureAxis, getValueAxis } from './components/axis'
import { getPolarCoordinateSystem } from './components/coordinate'
import { getAxisDataZooms } from './components/data-zoom'
import { dimensionToSeriesComponent, referenceLines, serializeSeriesComponent } from './components/series'
import { getEChartsTooltip } from './components/tooltip'
import { dimensionVisualMaps } from './components/visualMap'
import { gatherCoordinates, trellisCoordinates } from './coordinates'
import {
  AxisEnum,
  CoordinateContext,
  EChartsContext,
  EChartsDataset,
  EChartsOptions,
  ICoordinate,
  ICoordinateCartesian2d,
  isCoordinatePolar
} from './types'
import { mergeChartOptions } from './utils'

export function scatter(
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
  const pieCoordinates = trellisCoordinates(context, 'grid', scatterCoordinate)
  return {
    ...context,
    echartsOptions: gatherCoordinates(pieCoordinates, 'scatter', options),
    onClick: (event) => {
      const dimension = chartAnnotation.dimensions[0]
      const hierarchy = getEntityHierarchy(entityType, dimension)
      const caption = getDimensionMemberCaption(dimension, entityType)
      const slicer =
        chartAnnotation.dimensions.length > 1
          ? {
              filteringLogic: FilteringLogic.And,
              children: chartAnnotation.dimensions.map((dimension) => {
                const hierarchy = getEntityHierarchy(entityType, dimension)
                const caption = getDimensionMemberCaption(dimension, entityType)
                return {
                  dimension,
                  members: [
                    {
                      key: event.data[hierarchy.name],
                      value: event.data[hierarchy.name],
                      label: event.data[caption],
                      caption: event.data[caption]
                    }
                  ]
                }
              })
            }
          : {
              dimension,
              members: [
                {
                  key: event.data[hierarchy.name],
                  value: event.data[hierarchy.name],
                  label: event.data[caption],
                  caption: event.data[caption]
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
export function scatterCoordinate(context: EChartsContext, data: Array<unknown>): ICoordinate {
  const { chartAnnotation, entityType, settings, options } = context
  const category = getChartCategory(chartAnnotation)
  const categoryCaption = getDimensionMemberCaption(category, entityType)
  const chartSeries = getChartSeries(chartAnnotation)

  // @todo 抽象成同一的 Axis 类型以支持 Dimension 和 Measure
  const axis1 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
  const axis2 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis2, 1)

  context.datasets = []
  if (chartSeries) {
    const chartSeriesName = getPropertyHierarchy(chartSeries)
    const chartSeriesTextName = getDimensionMemberCaption(chartSeries, entityType)
    const categoryValues = uniqBy(data, chartSeriesName).map((x) => ({
      value: x[chartSeriesName],
      label: x[chartSeriesTextName]
    }))

    const dataset: EChartsDataset = {
      source: data,
      transforms: []
    }
    const seriesComponents = []
    // Split the dataset into groups by transform filter
    categoryValues.forEach(({ value, label }, index) => {
      dataset.transforms.push({
        transform: [
          {
            type: 'filter',
            config: { dimension: chartSeriesName, value: value }
          }
        ]
      })
      const seriesComponent = dimensionToSeriesComponent(
        label || value,
        chartSeries,
        chartAnnotation.measures,
        data,
        entityType,
        settings
      )
      seriesComponent.datasetIndex = index + 1
      seriesComponents.push(seriesComponent)
    })

    const visualMaps = dimensionVisualMaps(category, chartAnnotation, dataset, entityType)
    context.datasets.push({
      dataset,
      seriesComponents,
      tooltip: {
        valueFormatter: (value: Array<number | string>) => {
          return [
            formatMeasureNumber(
              { measure: axis1, property: null },
              value[0],
              settings.locale,
              axis1.formatting?.shortNumber
            ),
            formatMeasureNumber(
              { measure: axis2, property: null },
              value[1],
              settings.locale,
              axis2.formatting?.shortNumber
            )
          ]
        }
      },
      visualMaps
    })
  } else {
    const seriesComponent = dimensionToSeriesComponent(
      null,
      category,
      chartAnnotation.measures,
      data,
      entityType,
      settings
    )
    const dataset = {
      source: data
    }

    const visualMaps = dimensionVisualMaps(category, chartAnnotation, dataset, entityType)

    context.datasets = [
      {
        dataset,
        seriesComponents: [seriesComponent],
        tooltip: getEChartsTooltip(
          options?.tooltip,
          category,
          entityType,
          chartAnnotation.measures.map((measure) => ({
            measure,
            property: getEntityProperty(entityType, measure)
          })),
          [seriesComponent],
          settings.locale
        ),
        visualMaps
      }
    ]
  }

  // const { categoryAxis, valueAxis } = getCoordinateSystem(context, data, settings.locale)
  const type = chartAnnotation.chartType.variant === 'polar' ? 'Polar' : 'Cartesian2d'
  const { categoryAxis, valueAxis } =
    type === 'Polar'
      ? getPolarCoordinateSystem(context, data, settings.locale)
      : getCoordinateSystem(context, data, settings.locale)

  const gridOptions: ICoordinateCartesian2d = {
    type,
    name: '',
    grid: assignDeepOmitBlank(
      {
        containLabel: true
      },
      options?.grid
    ),
    [categoryAxis.orient]: categoryAxis.axis,
    [valueAxis.orient]: valueAxis.axis,
    visualMap: [],
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

  context.datasets.forEach(({ dataset, seriesComponents, tooltip, visualMaps }) => {
    gridOptions.datasets.push({
      dataset,
      series: seriesComponents.map((seriesComponent) => {
        const { series } = serializeSeriesComponent(
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
            [AxisEnum[categoryAxis.orient]]: axis1?.measure,
            [AxisEnum[valueAxis.orient]]: axis2?.measure,
            itemName: categoryCaption,
            tooltip: [axis1?.measure, axis2?.measure, ...seriesComponent.tooltip]
          }
        }

        /**
         * 依赖于 Measure 1 和 Measure 2 的 referenceLines
         */
        if (!isEmpty(axis1?.referenceLines) || !isEmpty(axis2?.referenceLines)) {
          series.markLine = mergeChartOptions({ data: [] }, [], options.seriesStyle.markLine)
          assign(series, referenceLines(axis1, axis2, options, valueAxis.orient, settings?.locale))
        }

        series.tooltip = tooltip

        return {
          options: mergeChartOptions(
            series,
            [],
            options?.seriesStyle,
            (<EChartsOptions>seriesComponent.chartOptions)?.seriesStyle
          ),
          visualMaps: []
        }
      })
    })

    gridOptions.visualMap.push(...(visualMaps ?? []))
  })

  if (options?.tooltip?.trigger === 'axis') {
    const measure = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
    gridOptions.tooltip.push({
      ...omitBlank(options.tooltip),
      trigger: 'axis',
      valueFormatter: (value: Array<number | string>) => {
        return value.map((value) =>
          formatMeasureNumber({ measure, property: null }, value, settings.locale, measure.formatting?.shortNumber)
        )
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
    gridOptions.legend.push(omitBlank(options.legend))
  }

  return gridOptions
}

function getCoordinateSystem(context: EChartsContext, items: Array<unknown>, locale: string) {
  const { chartAnnotation, entityType, options: chartOptions } = context
  const [categoryOrient, valueOrient] = axisOrient(chartAnnotation.chartType.orient)

  const axis1 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis1, 0)
  const axis2 = getMeasureAxis(chartAnnotation, ChartMeasureRoleType.Axis2, 1)
  const valueAxises = getValueAxis(chartAnnotation, entityType, chartOptions, locale)
  return {
    categoryAxis: { orient: categoryOrient, axis: [valueAxises[0]], dataZooms: getAxisDataZooms(axis1, AxisEnum.x) },
    valueAxis: { orient: valueOrient, axis: [valueAxises[1]], dataZooms: getAxisDataZooms(axis2, AxisEnum.y) }
  }
}
