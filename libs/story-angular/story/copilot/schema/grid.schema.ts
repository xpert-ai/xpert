import { AnalyticsAnnotation, DeepPartial, DimensionSchema, EntityType, MeasureSchema, tryFixDimension } from '@xpert-ai/ocap-core'
import { z } from 'zod'

export const AnalyticsAnnotationSchema = z
  .object({
    rows: z.array(DimensionSchema),
    columns: z.array(MeasureSchema),
  })
  .describe('Grid data settings for AnalyticalGrid widget')

export const GridWidgetSchema = z.object({
  title: z.string().describe(`Title of the widget`),
  position: z.object({
    x: z.number().describe(`Position x of the widget in the page layout`),
    y: z.number().describe(`Position y of the widget in the page layout`),
    cols: z.number().describe('Width of the widget in page layout'),
    rows: z.number().describe('Height of the widget in page layout')
  })
})

export function createTableWidgetSchema() {
  return {
    // component: z.enum([WidgetComponentType.AnalyticalGrid]),

    analytics: AnalyticsAnnotationSchema.optional(),

    /**
     * Refer to {@link WidgetAnalyticalGridOptions }
     */
    options: z
      .object({
        showToolbar: z.boolean().default(true).describe('Show toolbar'),
        strip: z.boolean().optional().describe('Is strip'),
        grid: z.boolean().optional().describe('Is grid'),
        paging: z.boolean().default(true).optional().describe('Is paging'),
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
  }
}

export function tryFixAnalyticsAnnotation(analytics: DeepPartial<AnalyticsAnnotation>, entityType: EntityType) {
  return (
    analytics && {
      ...analytics,
      rows: analytics.rows?.map((d: any) => tryFixDimension(d, entityType)) ?? [],
      columns: analytics.columns?.map((d: any) => tryFixDimension(d, entityType)) ?? []
    }
  )
}
