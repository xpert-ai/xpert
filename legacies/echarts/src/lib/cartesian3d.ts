import {
  assignDeepOmitBlank,
  ChartAnnotation,
  ChartOptions,
  ChartSettings,
  EntityType,
  getChartCategory,
  getDimensionMemberCaption,
  getEntityHierarchy,
  getEntityProperty,
  getPropertyHierarchy,
  getPropertyMeasure,
  getPropertyName,
  QueryReturn
} from '@metad/ocap-core'
import { formatMeasureValue } from './common'
import { valueAxisLabelFormatter } from './components/axis'
import { measuresToSeriesComponents, serializeSeriesComponent } from './components/series'
import { EChartsContext, EChartsOptions } from './types'
import { mergeChartOptions, pickEChartsGlobalOptions } from './utils'


export function cartesian3d(
  data: QueryReturn<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: ChartOptions,
  type: string
): EChartsContext {
  const context = {
    data,
    chartAnnotation,
    entityType,
    settings,
    options
  }
  
  const cartesianCoordinate = cartesianCoordinate3d(data.data, chartAnnotation, entityType, settings, options)

  const echartsOptions = {
    dataset: [],
    grid3D: [],
    xAxis3D: [],
    yAxis3D: [],
    zAxis3D: [],
    series: [],
    visualMap: [],
    tooltip: []
  }

  ;[cartesianCoordinate].forEach((cartesianCoordinate) => {
    echartsOptions.grid3D.push(cartesianCoordinate.grid3D)
    echartsOptions.xAxis3D.push(cartesianCoordinate.xAxis3D)
    echartsOptions.yAxis3D.push(cartesianCoordinate.yAxis3D)
    echartsOptions.zAxis3D.push(cartesianCoordinate.zAxis3D)
    echartsOptions.visualMap.push(...cartesianCoordinate.visualMap)
    echartsOptions.tooltip.push(...cartesianCoordinate.tooltip)

    cartesianCoordinate.datasets.forEach(({ dataset, series }) => {
      echartsOptions.dataset.push(dataset)
      series.forEach((series) => {
        echartsOptions.series.push({
          ...series,
          datasetIndex: echartsOptions.dataset.length - 1,
          type: series.type ?? type
        })
      })
    })
  })

  return {
    ...context,
    echartsOptions: assignDeepOmitBlank(echartsOptions, pickEChartsGlobalOptions(options), Number.MAX_SAFE_INTEGER)
  }
}

// 单个笛卡尔坐标系
export function cartesianCoordinate3d(
  data: Array<unknown>,
  chartAnnotation: ChartAnnotation,
  entityType: EntityType,
  settings: ChartSettings,
  options: EChartsOptions
) {
  const category = getChartCategory(chartAnnotation)
  const category2 = chartAnnotation.dimensions[1]
  const xHierarchy = getEntityHierarchy(entityType, category)
  const xHierarchyCaption = getDimensionMemberCaption(category, entityType)
  const yHierarchy = getEntityHierarchy(entityType, category2)
  const yHierarchyCaption = getDimensionMemberCaption(category2, entityType)

  const mainMeasure = chartAnnotation.measures[0]

  const datasets = [
    {
      dataset: {
        source: data,
        dimensions: [
          ...chartAnnotation.dimensions.map(getPropertyName),
          ...chartAnnotation.measures.map(getPropertyMeasure)
        ]
      },
      seriesComponents: measuresToSeriesComponents(chartAnnotation.measures, data, entityType, settings),
    }
  ]

  const tooltips = [
    {
      value: xHierarchyCaption,
      label: xHierarchy.caption || xHierarchy.name,
      valueFormatter: null
    },
    {
      value: yHierarchyCaption,
      label: yHierarchy.caption || yHierarchy.name,
      valueFormatter: null
    },
    ...chartAnnotation.measures.map((measure) => {
      const measureProperty = getEntityProperty(entityType, measure)
      return {
        value: measureProperty.name,
        label: measureProperty.caption || measureProperty.name,
        valueFormatter: (value: number | string) => {
          const {value: digitsNumber, shortUnit, unit} = formatMeasureValue(measure, measureProperty, value, settings?.locale)
          return `${digitsNumber}${shortUnit ? `<span style="font-size: smaller;">${shortUnit}</span>` : ''}${unit ? `<span>${unit}</span>` : ''}`
        }
      }
    }),
  ]

  const grid3dOptions = {
    grid3D: mergeChartOptions({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      containLabel: true
    }, [], options?.grid3D),
    xAxis3D: mergeChartOptions(
      {
        type: 'category',
        name: xHierarchy.caption,
        axisLabel: {
          formatter: (key: string, tick: number, ...params) => {
            const caption = data.find((item) => item[xHierarchy.name] === key)?.[xHierarchy.memberCaption]
            return caption || key
          }
        }
      },
      [],
      options?.xAxis3D,
      category.chartOptions?.axis
    ),
    yAxis3D: mergeChartOptions(
      {
        type: 'category',
        name: yHierarchy.caption,
        axisLabel: {
          formatter: (key: string, tick: number, ...params) => {
            const caption = data.find((item) => item[yHierarchy.name] === key)?.[yHierarchy.memberCaption]
            return caption || key
          }
        },
      },
      [],
      options?.yAxis3D,
      category2.chartOptions?.axis
    ),
    zAxis3D: mergeChartOptions(
      {
        type: 'value',
        axisLabel: {
          formatter: (value, index: number) =>
            valueAxisLabelFormatter(mainMeasure, getEntityProperty(entityType, mainMeasure), value, settings?.locale)
        }
      },
      [],
      options?.zAxis3D,
      mainMeasure.chartOptions?.axis
    ),
    visualMap: [],
    datasets: [],
    tooltip: [
      mergeChartOptions(
        {
          valueFormatter: (params) => {
            console.log(params)
            return ``
          },
          formatter: (params) => {
            return params.marker + tooltips.map(({value, label, valueFormatter}) =>
              `<div style="display: flex; justify-content: space-between; align-items: center;">
<span style="margin-right: 1rem;">${label}:</span><span style="font-weight: bold;">${(valueFormatter ? valueFormatter(params.data[value]) : params.data[value])}</span>
</div>`).join('')
          },
        },
        [],
        options?.tooltip,
      )
    ]
  }

  datasets.forEach(({ dataset, seriesComponents }) => {
    grid3dOptions.datasets.push({
      dataset,
      series: seriesComponents.map((seriesComponent, seriesIndex) => {
        const { series, visualMaps } = serializeSeriesComponent(
          dataset,
          seriesComponent,
          entityType,
          'z',
          settings,
          options
        )
        grid3dOptions.visualMap.push(...visualMaps.map((item) => ({...item, seriesIndex})))

        series.encode = {
          x: getPropertyHierarchy(category),
          y: getPropertyHierarchy(category2),
          z: seriesComponent.measure,
        }

        return mergeChartOptions(series, [], options?.seriesStyle, (<EChartsOptions>seriesComponent.chartOptions)?.seriesStyle)
      })
    })
  })

  return grid3dOptions
}
