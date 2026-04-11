import { CHARTS, DimensionSchema, MeasureSchema } from '@xpert-ai/ocap-core'
import { z } from 'zod'

export function makeChartRulesPrompt() {
  return ``
}

export function makeChartEnum() {
  return CHARTS.map((g) => g.charts.map((c) => c.label)).flat()
}

export function makeChartSchema() {
  return z
    .object({
      cube: z.string().describe('The cube name used by the chart'),
      chartType: z.object({
        type: z.enum(makeChartEnum() as unknown as z.EnumValues).describe('The chart type'),
        chartOptions: z
          .object({
            seriesStyle: z.any().describe('The series options of ECharts library'),
            legend: z.any().describe('The legend options of ECharts library'),
            axis: z.any().describe('The axis options of ECharts library'),
            dataZoom: z.any().describe('The dataZoom options of ECharts library'),
            tooltip: z.any().describe('The tooltip options of ECharts library')
          })
          .describe('The chart options of ECharts library')
      }),
      // dimensions: z
      //   .array(
      //     z.object({
      //       dimension: z.string().describe('The name of dimension'),
      //       hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
      //       level: z.string().optional().describe('The name of the level in the hierarchy')
      //     })
      //   )
      //   .describe('The dimensions used by the chart, at least one dimension'),
      // measures: z
      //   .array(
      //     z.object({
      //       measure: z.string().describe('The name of the measure'),
      //       order: z.enum(['ASC', 'DESC']).optional().describe('The order of the measure'),
      //       chartOptions: z.any().optional().describe('The chart options of ECharts library')
      //     })
      //   )
      //   .describe('The measures used by the chart, At least one measure'),
      slicers: z
        .array(
          z.object({
            dimension: z
              .object({
                dimension: z.string().describe('The name of the dimension'),
                hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
                level: z.string().optional().describe('The name of the level in the hierarchy')
              })
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
    .describe('The chart schema')
}

export function makeChartDimensionSchema() {
  return DimensionSchema
}

export function makeChartMeasureSchema() {
  return MeasureSchema
}
