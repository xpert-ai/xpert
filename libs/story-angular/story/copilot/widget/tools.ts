import { inject, Signal } from '@angular/core'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { nanoid } from '@xpert-ai/copilot'
import { DataSettingsSchema, tryFixSlicer } from '@xpert-ai/core'
import { DataSettings, EntityType } from '@xpert-ai/ocap-core'
import { NxStoryService, WidgetComponentType } from '@xpert-ai/story/core'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom } from 'rxjs'
import { z } from 'zod'
import {
  chartAnnotationCheck,
  ChartSchema,
  ChartWidgetSchema,
  completeChartAnnotation,
  createTableWidgetSchema,
  createWidgetSchema,
  tryFixAnalyticsAnnotation
} from '../schema'

export function injectUpdateChartTools() {
  const storyService = inject(NxStoryService)

  return [
    new DynamicStructuredTool({
      name: 'updateChartStyle',
      description: 'Update sytle of chart widget in story page.',
      schema: z.object({
        key: z.string().describe('The key of the widget'),
        chart: ChartSchema.describe('The chart config')
      }),
      func: async ({ key, chart }) => {
        const entityType = await firstValueFrom(storyService.selectWidgetEntityType(key))
        storyService.updateWidget({
          widgetKey: key,
          widget: {
            dataSettings: {
              chartAnnotation: completeChartAnnotation(chartAnnotationCheck(chart, entityType))
            }
          }
        })
        return `The styles of story chart widget updated!`
      }
    })
  ]
}

export function injectCreateChartTool(defaultDataSettings: Signal<DataSettings>, defaultCube: Signal<EntityType>) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createChartTool = new DynamicStructuredTool({
    name: 'createChartWidget',
    description: 'Create a new widget in story page.',
    schema: ChartWidgetSchema,
    func: async ({dataSettings, title, position, chart, slicers}) => {
      logger.debug(
        '[Story] [AI Copilot] [Command tool] [createChartWidget] inputs:',
        'title:',
        title,
        'position:',
        position,
        'dataSettings:',
        dataSettings,
        'chartAnnotation:',
        chart,
        'slicers:',
        slicers
      )

      try {
        const entityType = defaultCube()
        storyService.createStoryWidget({
          component: WidgetComponentType.AnalyticalCard,
          position: position ?? { x: 0, y: 0, rows: 5, cols: 5 },
          title: title,
          dataSettings: {
            ...(defaultDataSettings() ?? {}),
            ...(dataSettings ?? {}),
            chartAnnotation: completeChartAnnotation(chartAnnotationCheck(chart, entityType)),
            selectionVariant: {
              selectOptions: (slicers ?? ((<any>chart).slicers as any[]))?.map((slicer) =>
                tryFixSlicer(slicer, entityType)
              )
            }
          }
        })
      } catch (error) {
        return `Error: ${error}`
      }

      return `Story chart widget created!`
    }
  })

  return createChartTool
}

export function injectCreateTableTool(defaultDataSettings: Signal<DataSettings>, defaultCube: Signal<EntityType>) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createTableTool = new DynamicStructuredTool({
    name: 'createTableWidget',
    description: 'Create a new table widget.',
    schema: createWidgetSchema(createTableWidgetSchema()),
    func: async ({ title, position, analytics, options }) => {
      logger.debug(
        '[Story] [AI Copilot] [Command tool] [createTableWidget] inputs:',
        title,
        position,
        analytics,
        options
      )

      const entityType = defaultCube()
      const key = nanoid()
      storyService.createStoryWidget({
        key,
        component: WidgetComponentType.AnalyticalGrid,
        position: position,
        title: title,
        dataSettings: {
          ...(defaultDataSettings() ?? {}),
          analytics: tryFixAnalyticsAnnotation(analytics, entityType)
        },
        options
      })

      return `Story table widget '${key}' created!`
    }
  })

  return createTableTool
}
