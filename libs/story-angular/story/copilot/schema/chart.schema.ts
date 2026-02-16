import { makeChartEnum } from '@metad/core'
import {
  ChartAnnotation,
  ChartMeasureSchema,
  ChartType,
  DataSettingsSchema,
  DeepPartial,
  DimensionSchema,
  EntityType,
  SlicerSchema,
  assignDeepOmitBlank,
  cloneDeep,
  getChartType,
  omit,
  tryFixDimension
} from '@metad/ocap-core'
import { z } from 'zod'

const ChartTypes = makeChartEnum()
const ChartMainTypes = new Set(Object.values(ChartTypes))

export const EChartsOptions = z
  .object({
    seriesStyle: z.any().optional().describe('The series options of ECharts library'),
    legend: z.any().optional().describe('The legend options of ECharts library'),
    axis: z.any().optional().describe('The axis options of ECharts library'),
    dataZoom: z.any().optional().describe('The dataZoom options of ECharts library'),
    tooltip: z.any().optional().describe('The tooltip options of ECharts library'),
    aria: z
      .object({
        enabled: z.boolean().optional().describe('Whether to show the aria of ECharts library'),
        decal: z
          .object({
            show: z.boolean().optional().describe('Whether to show the decal')
          })
          .optional()
          .describe('The decal options of aria')
      })
      .optional()
      .describe('The aria options of ECharts library')
  })
  .describe('The chart options of ECharts library')

export const ChartSchema = z.object({
  chartType: z.object({
    type: z.enum(ChartTypes as unknown as z.EnumValues).describe('The chart type'),
    chartOptions: EChartsOptions.optional()
  }),
  dimensions: z.array(DimensionSchema).describe('The dimensions used by the chart'),
  measures: z.array(ChartMeasureSchema).describe('The measures used by the chart'),
  slicers: z.array(SlicerSchema).optional().describe('The slicers used by the chart data')
})

export const ChartWidgetSchema = z.object({
  title: z.string().optional().describe(`Title of the widget`),
  position: z
    .object({
      x: z.number().describe(`Position x of the widget in the page layout`),
      y: z.number().describe(`Position y of the widget in the page layout`),
      cols: z.number().describe('Width of the widget in page layout'),
      rows: z.number().describe('Height of the widget in page layout')
    })
    .optional(),
  dataSettings: DataSettingsSchema.optional().describe('The data settings of the widget'),
  chart: ChartSchema.describe('Chart configuration'),
  slicers: z.array(SlicerSchema).optional().describe('The slicers used by the chart data')
})

/**
 * @unresolved AI Copilot maybe pass hierarchy or level to the dimension, which needs to be converted to the exact dimension
 *
 * @param chartAnnotation
 * @param entityType
 * @returns
 */
export function chartAnnotationCheck(
  chartAnnotation: DeepPartial<ChartAnnotation>,
  entityType: EntityType,
  schema?: any
): DeepPartial<ChartAnnotation> {
  if (!chartAnnotation) {
    return chartAnnotation
  }

  let chartType = chartAnnotation.chartType as ChartType

  const chartOptions = chartType.chartOptions ?? {}
  chartType.chartOptions = Object.keys(chartOptions).reduce((acc, key) => {
    acc[key] = chartOptions[key]
    acc[`__show${key}__`] = true
    return acc
  }, {})

  if (chartAnnotation.chartType?.type && !ChartMainTypes.has(chartAnnotation.chartType.type)) {
    chartType = assignDeepOmitBlank(
      cloneDeep(getChartType(chartAnnotation.chartType.type)?.value.chartType),
      omit(chartType, 'type'),
      5
    )
  }

  return {
    ...chartAnnotation,
    chartType,
    dimensions: (chartAnnotation.dimensions ?? schema?.dimensions)?.map((item) => tryFixDimension(item, entityType)),
    measures: chartAnnotation.measures ?? schema?.measures
  }
}

export function completeChartAnnotation(chart: DeepPartial<ChartAnnotation>): DeepPartial<ChartAnnotation> {
  return (
    chart && {
      ...chart,
      dimensions: chart.dimensions ?? [],
      measures:
        chart.measures?.map((item) => ({
          ...item,
          formatting: {
            shortNumber: true
          }
        })) ?? []
    }
  )
}
