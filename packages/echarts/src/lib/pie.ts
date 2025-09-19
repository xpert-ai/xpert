import {
  ChartAnnotation,
  ChartSettings,
  EntityType,
  getChartCategory,
  getEntityProperty,
  getPropertyHierarchy,
  mergeOptions,
  QueryReturn,
  isNil,
  assignDeepOmitBlank,
  getDimensionMemberCaption,
  PieVariant,
} from '@metad/ocap-core'
import { trellisCoordinates, gatherCoordinates } from './coordinates'
import { getEChartsTooltip } from './components/tooltip'
import { CoordinateContext, EChartsContext, EChartsOptions, ICoordinate } from './types'
import { getCoordinateSystem } from './components/coordinate'
import { measuresToSeriesComponents, serializeSeriesComponent } from './components/series'
import { mergeChartOptions } from './utils'

export function pie(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {

  if (data.data?.length > (settings?.maximumLimit ?? 100)) {
    throw new Error(`Too much data, length ${data.data?.length}`)
  }

  const context: CoordinateContext = {
    data,
    chartAnnotation,
    entityType,
    settings,
    options,
  }

  const pieCoordinates = trellisCoordinates(context, 'pie', pieCoordinate)
  return {
    ...context,
    echartsOptions: gatherCoordinates(pieCoordinates, 'pie', options)
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
export function pieCoordinate(
  context: EChartsContext,
  data: Array<unknown>,
): ICoordinate {
  const { chartAnnotation, entityType, settings, options } = context
  const category = getChartCategory(chartAnnotation)
  const categoryMemberCaption = getDimensionMemberCaption(category, entityType)
  const categoryProperty = getEntityProperty(entityType, category)


  context.datasets = []

  const seriesComponents = measuresToSeriesComponents(chartAnnotation.measures, data, entityType, settings)
  context.datasets = [
    {
      dataset: {
        source: data,
        // 非矩阵数据集应该不用定义 dimensions , 因为会直接使用字段名作为 encode
        // dimensions: [
        //   ...chartAnnotation.dimensions.map(getPropertyName),
        //   ...chartAnnotation.measures.map(getPropertyMeasure)
        // ]
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

  const gridOptions: ICoordinate = {
    type: 'Pie',
    name: '',
    grid: mergeOptions(
      {
        containLabel: true
      },
      options?.grid
    ),
    // visualMap: [],
    datasets: [],
    tooltip: [],
    legend: [],
  }

  if (!categoryProperty) {
    const series: any = {
          type: 'pie',
          data: seriesComponents.map((seriesComponent) => ({
            value: data[0][seriesComponent.measure],
            name: seriesComponent.property.caption || seriesComponent.measure
          })),
          label: {
            show: true,
            formatter: '{b|{b}}\n{c}\n{per|{d}%}',
            rich: {
              b: {
                color: '#4C5058',
                fontSize: 14,
                fontWeight: 'bold',
              },
              per: {
                color: '#eee',
                backgroundColor: 'black',
                padding: [2, 4],
                borderRadius: 3
              }
            }
          },
        }
    if (chartAnnotation.chartType.variant === PieVariant.Doughnut) {
      series.radius = ['40%', '80%']
      series.itemStyle = {
        borderRadius: 5
      }
    }
    if (chartAnnotation.chartType.variant === PieVariant.Nightingale) {
      series.roseType = 'area'
      series.radius = ['20%', '80%']
      series.itemStyle = {
        borderRadius: 5
      }
    }
    gridOptions.datasets.push({
      dataset: {
      },
      series: [{
        options: mergeChartOptions(series, [], options?.seriesStyle, (<EChartsOptions>seriesComponents[0]?.chartOptions)?.seriesStyle)
      }]
    })

    return gridOptions
  }

  const { valueAxis } = getCoordinateSystem(context, data, settings.locale)
  context.datasets.forEach(({ dataset, seriesComponents, tooltip }) => {
    gridOptions.datasets.push({
      dataset,
      series: seriesComponents.map((seriesComponent) => {
        const { series, visualMaps } = serializeSeriesComponent(
          dataset,
          {...seriesComponent, seriesType: 'pie'},
          entityType,
          valueAxis,
          settings,
          options
        )

        /**
         * 堆积系列情况下不适用 encode, 使用的应该是 seriesLayoutBy: "row" name: "[Canada]" 与 dataset 中的行数据进行的对应
         */
        if (isNil(series.seriesLayoutBy)) {
          series.encode = {
            itemId: getPropertyHierarchy(category),
            itemName: categoryMemberCaption,
            value: seriesComponent.measure,
            tooltip: seriesComponent.tooltip
          }
        }

        if (chartAnnotation.chartType.variant === PieVariant.Doughnut) {
          series.radius = ['40%', '80%']
          series.itemStyle = {
            borderRadius: 5
          }
        }
        if (chartAnnotation.chartType.variant === PieVariant.Nightingale) {
          series.roseType = 'area'
          series.radius = ['20%', '80%']
          series.itemStyle = {
            borderRadius: 5
          }
        }

        series.tooltip = tooltip

        return {
          options: mergeChartOptions(series, [], options?.seriesStyle, (<EChartsOptions>seriesComponent.chartOptions)?.seriesStyle),
          visualMaps
        }
      })
    })

    gridOptions.tooltip.push(tooltip)

    if (seriesComponents.length > 1) {
      gridOptions.legend.push(
        assignDeepOmitBlank(
          {
            show: true,
            data: seriesComponents.map(({ name }) => name),
            selectedMode: 'single',
          },
          options?.legend,
          Number.MAX_SAFE_INTEGER
        )
      )
    } else if(options?.legend) {
      gridOptions.legend.push(options.legend)
    }
  })

  return gridOptions
}
