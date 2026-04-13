import { CopilotDefaultOptions } from '@xpert-ai/copilot'
import { DimensionSchema } from '@xpert-ai/ocap-core'
import { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'

export const ControlWidgetSchema = z.object({
  title: z.string().describe(`Title of the widget`),
  position: z.object({
    x: z.number().describe(`Position x of the widget in the page layout`),
    y: z.number().describe(`Position y of the widget in the page layout`),
    cols: z.number().describe('Width of the widget in page layout'),
    rows: z.number().describe('Height of the widget in page layout')
  }),

  dimension: DimensionSchema.describe('Dimension of the widget'),

  /**
   * Refer to {@link WidgetAnalyticalGridOptions }
   */
  options: z
    .object({
      showToolbar: z.boolean().default(true).optional().describe('Show toolbar'),
      strip: z.boolean().optional().describe('Is strip'),
      grid: z.boolean().optional().describe('Is grid'),
      paging: z.boolean().optional().describe('Is paging'),
      pageSize: z.number().optional().describe('Page size'),
      sticky: z.boolean().optional().describe('Is sticky'),
      hideDataDownload: z.boolean().optional().describe('Hide data download'),
      initialRowLevel: z.number().optional().describe('Initial row level'),
      initialColumnLevel: z.number().optional().describe('Initial column level'),
      sortable: z.boolean().optional().describe('Is sortable'),
      selectable: z.boolean().optional().describe('Is selectable'),
      digitsInfo: z.string().optional().describe('Digits info'),
      unit: z.string().optional().describe('Unit'),
      currencyCode: z.string().optional().describe('Currency code')
    })
    .optional()
    .describe('Grid options for AnalyticalGrid widget')
})

export const editWidgetControl = {
  ...CopilotDefaultOptions,
  functions: [
    {
      name: 'edit-story-widget-control',
      description: 'Should always be used to properly format output',
      parameters: zodToJsonSchema(ControlWidgetSchema)
    }
  ],
  function_call: { name: 'edit-story-widget-control' }
}
