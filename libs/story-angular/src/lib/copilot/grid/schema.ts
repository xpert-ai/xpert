import { CopilotDefaultOptions } from '@xpert-ai/copilot'
import { AnalyticsAnnotation, EntityType } from '@xpert-ai/ocap-core'
import { fixDimension } from '@xpert-ai/story/core'
import { GridWidgetSchema } from '@xpert-ai/story/story'
import zodToJsonSchema from 'zod-to-json-schema'

export const editWidgetGrid = {
  ...CopilotDefaultOptions,
  functions: [
    {
      name: 'edit-story-widget-grid',
      description: 'Should always be used to properly format output',
      parameters: zodToJsonSchema(GridWidgetSchema)
    }
  ],
  function_call: { name: 'edit-story-widget-grid' }
}

export function analyticsAnnotationCheck(analytics: AnalyticsAnnotation, entityType: EntityType) {
  if (!analytics) {
    return analytics
  }

  return {
    ...analytics,
    rows: analytics.rows?.map((item) => fixDimension(item, entityType)),
    columns: analytics.columns?.map((item) => fixDimension(item, entityType))
  }
}
