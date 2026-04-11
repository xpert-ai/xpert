import { Signal, inject } from '@angular/core'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { injectDimensionMemberTool, makeCubeRulesPrompt } from '@xpert-ai/core'
import {
  CalculationType,
  DataSettings,
  DataSettingsSchema,
  EntityType,
  RestrictedMeasureProperty
} from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { Route } from 'apps/cloud/src/app/@core/copilot'
import { nanoid } from 'nanoid'
import { NGXLogger } from 'ngx-logger'
import { z } from 'zod'
import { RestrictedMeasureSchema } from '../schema'
import { injectPickCubeTool } from '../tools'
import { MEMBER_RETRIEVER_PROMPT } from './types'

export function injectCreateRestrictedMeasureWorker(
  defaultModelCube: Signal<{ dataSource: string; cube: EntityType }>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const memberRetrieverTool = injectDimensionMemberTool()
  const pickCubeTool = injectPickCubeTool()
  const createRestrictedMeasureTool = injectCreateRestrictedMeasureTool(defaultModelCube, callback)

  const tools = [pickCubeTool, memberRetrieverTool, createRestrictedMeasureTool]

  return async ({ llm }: { llm: BaseChatModel }) => {
    const systemPrompt =
      `You are a data analyst. Please create a measure that aggregate values based on restrictions imposed by dimension members.` +
      ` It is useful when you need to filter or limit the data aggregation to specific members of a dimension.` +
      MEMBER_RETRIEVER_PROMPT +
      ` The name of new calculation measure should be unique with existing measures.` +
      ` Use the dimensions, hierarchy, level and other names accurately according to the cube information provided.` +
      makeCubeRulesPrompt() +
      `\nTry to perform derivative calculations based on existing measures.` +
      `\n\n{role}` +
      `\n\n{context}`

    return await Route.createWorkerAgent(llm, tools, systemPrompt)
  }
}

export function injectCreateRestrictedMeasureTool(
  defaultModelCube: Signal<{ dataSource: string; cube: EntityType }>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createRestrictedMeasureTool = new DynamicStructuredTool({
    name: 'createRestrictedMeasure',
    description: 'Create or edit restricted measure for cube.',
    schema: z.object({
      dataSettings: DataSettingsSchema.optional(),
      property: RestrictedMeasureSchema
    }),
    func: async ({ dataSettings, property }) => {
      const key = property.__id__ || nanoid()
      try {
        const _dataSettings = (dataSettings as DataSettings) ?? {
          dataSource: defaultModelCube().dataSource,
          entitySet: defaultModelCube().cube?.name
        }
        storyService.addCalculationMeasure({
          dataSettings: _dataSettings,
          calculation: {
            ...property,
            __id__: key,
            calculationType: CalculationType.Restricted
          } as RestrictedMeasureProperty
        })

        logger.debug(`Restricted calculation measure created: `, _dataSettings, property)

        callback(_dataSettings, key)

        return `Restricted calculation measure created!`
      } catch (error: any) {
        return `Error creating restricted calculation measure: ${error.message}`
      }
    }
  })

  return createRestrictedMeasureTool
}
