import { WidgetComponentType } from '@xpert-ai/story/core'
import { z } from 'zod'
import { ChartSchema } from './chart.schema'
import { AnalyticsAnnotationSchema } from './grid.schema'

/**
 * @deprecated use createWidgetSchema instead
 */
export const StoryWidgetSchema = z.object({
  title: z.string().describe(`Title of the widget`),
  position: z.object({
    x: z.number().describe(`Position x of the widget in the page layout`),
    y: z.number().describe(`Position y of the widget in the page layout`),
    cols: z.number().describe('Width of the widget in page layout'),
    rows: z.number().describe('Height of the widget in page layout')
  }),

  component: z
    .enum([WidgetComponentType.AnalyticalCard, WidgetComponentType.AnalyticalGrid, WidgetComponentType.InputControl])
    .describe('The component type of widget'),

  chartAnnotation: ChartSchema.optional().describe('Chart settings when component type of widget is AnalyticalCard'),
  analytics: AnalyticsAnnotationSchema.optional().describe(
    'Grid settings when component type of widget is AnalyticalGrid;'
  ),
  gridSettings: z.object({
    showToolbar: z.boolean().default(true).optional().describe('Show toolbar in AnalyticalGrid widget')
  })
})

export function createWidgetSchema<T>(component: T) {
  return z.object({
    title: z.string().describe(`Title of the widget`),
    position: z.object({
      x: z.number().describe(`Position x of the widget in the page layout`),
      y: z.number().describe(`Position y of the widget in the page layout`),
      cols: z.number().describe('Width of the widget in page layout'),
      rows: z.number().describe('Height of the widget in page layout')
    }).optional(),

    ...component
  })
}

export function createWidgetStyleSchema() {
  return z.object({
    backgroundColor: z.string().optional().describe('Background color of the widget'),
  })
}
