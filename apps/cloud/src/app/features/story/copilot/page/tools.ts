import { inject } from '@angular/core'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { NxStoryService, StoryPointType, WidgetComponentType } from '@xpert-ai/story/core'
import { createWidgetSchema, StoryPageSchema, WidgetStyleSchema } from '@xpert-ai/story/story'
import { GridsterConfig } from 'angular-gridster2'
import { NGXLogger } from 'ngx-logger'
import { z } from 'zod'
import { MinCols, MinRows } from './types'

export function injectCreatePageTools() {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  return [
    new DynamicStructuredTool({
      name: 'createPage',
      description: 'Create a new page in story dashboard.',
      schema: z.object({
        page: StoryPageSchema
      }),
      func: async ({ page }) => {
        logger.debug(`Execute copilot action 'createPage':`, page)
        storyService.newStoryPage({
          ...page,
          type: StoryPointType.Canvas,
          gridOptions: {
            gridType: 'fit',
            minCols: page.gridOptions?.columns ?? MinCols,
            minRows: page.gridOptions?.rows ?? MinRows
          } as GridsterConfig
        })
        return `The new page be created!`
      }
    }),
    new DynamicStructuredTool({
      name: 'createTitle',
      description: 'Create a title widget in story dashboard page.',
      schema: z.object({
        widget: createWidgetSchema({}),
        options: z.object({
          text: z.string().describe('The text content of this widget')
        }).describe('Options of this text widget'),
        styling: WidgetStyleSchema.optional().describe('Css styles of this widget'),
      }),
      func: async ({ widget, styling, options }) => {
        logger.debug(`Execute copilot action 'createTitle':`, `widget:`, widget, options, styling)
        storyService.createStoryWidget({
          ...widget,
          component: WidgetComponentType.Text,
          options,
          styling
        })

        return `The new title widget be created!`
      }
    })
  ]
}
