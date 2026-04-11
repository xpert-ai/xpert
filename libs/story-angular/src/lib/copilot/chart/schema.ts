import { CopilotDefaultOptions } from '@xpert-ai/copilot'
import { DimensionSchema, MeasureSchema } from '@xpert-ai/core'
import { ChartAnnotation, ChartType, EntityType, assignDeepOmitBlank, cloneDeep, flatten, omit } from '@xpert-ai/ocap-core'
import { fixDimension } from '@xpert-ai/story/core'
import { CHARTS, ChartMainTypeEnum, getChartType } from '@xpert-ai/story/widgets/analytical-card'
import { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'

const ChartTypes = flatten(CHARTS.map((g) => g.charts.map((c) => c.label))) as any

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
    type: z.enum(ChartTypes).describe('The chart type'),
    chartOptions: EChartsOptions.optional()
  }),
  dimensions: z.array(DimensionSchema).describe('The dimensions used by the chart'),
  measures: z.array(MeasureSchema).describe('The measures used by the chart'),

  slicers: z
    .array(
      z.object({
        dimension: z
          .array(
            z.object({
              dimension: z.string().describe('The name of the dimension'),
              hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
              level: z.string().optional().describe('The name of the level in the hierarchy')
            })
          )
          .describe('The dimension of the slicer'),
        members: z
          .array(
            z.object({
              value: z.string().describe('the key of the member'),
              caption: z.string().describe('the caption of the member')
            })
          )
          .describe('The members in the slicer')
      })
    )
    .describe('The slicers used by the chart')
})

export const ChartWidgetSchema = z.object({
  title: z.string().describe(`Title of the widget`),
  position: z.object({
    x: z.number().describe(`Position x of the widget in the page layout`),
    y: z.number().describe(`Position y of the widget in the page layout`),
    cols: z.number().describe('Width of the widget in page layout'),
    rows: z.number().describe('Height of the widget in page layout')
  }),
  dataSettings: z
    .object({
      limit: z.number().optional().describe('The limit of the records')
    })
    .optional()
    .describe('The data settings of the widget'),
  chartAnnotation: ChartSchema.optional().describe('Chart settings when component type of widget is AnalyticalCard')
})

export const editWidgetChart = {
  ...CopilotDefaultOptions,
  functions: [
    {
      name: 'edit-story-widget-chart',
      description: 'Should always be used to properly format output',
      parameters: zodToJsonSchema(ChartWidgetSchema)
    }
  ],
  function_call: { name: 'edit-story-widget-chart' }
}

/**
 * @unresolved AI Copilot maybe pass hierarchy or level to the dimension, which needs to be converted to the exact dimension
 *
 * @param chartAnnotation
 * @param entityType
 * @returns
 */
export function chartAnnotationCheck(chartAnnotation: ChartAnnotation, entityType: EntityType): ChartAnnotation {
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

  if (chartAnnotation.chartType?.type && !ChartMainTypeEnum[chartAnnotation.chartType.type]) {
    chartType = assignDeepOmitBlank(
      cloneDeep(getChartType(chartAnnotation.chartType.type)?.value.chartType),
      omit(chartType, 'type'),
      5
    )
  }

  return {
    ...chartAnnotation,
    chartType,
    dimensions: chartAnnotation.dimensions.map((item) => fixDimension(item, entityType))
  }
}
