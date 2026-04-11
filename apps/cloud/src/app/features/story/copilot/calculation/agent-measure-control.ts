import { inject, Signal } from '@angular/core'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import {
  CalculationType,
  DataSettings,
  DataSettingsSchema,
  EntityType,
  markdownModelCube,
  MeasureControlProperty
} from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { Route } from 'apps/cloud/src/app/@core/copilot'
import { nanoid } from 'nanoid'
import { NGXLogger } from 'ngx-logger'
import { z } from 'zod'
import { MeasureControlSchema } from '../schema'
import { CalculationAgentState, MEASURE_CONTROL_AGENT_NAME } from './types'

export function injectCreateMeasureControlWorker(
  defaultModelCube: Signal<{ dataSource: string; modelId: string; cube: EntityType }>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const createMeasureControlTool = injectCreateMeasureControlTool(defaultModelCube, callback)

  return async ({ llm }: { llm: BaseChatModel }) => {
    const systemPrompt =
      `You are a data analyst. Given the following user request, please create a virtual measure that allows the selection among multiple measures.` +
      ` The name of new measure should be unique with existing measures.` +
      `\n\n{role}` +
      `\n\n{context}`

    const agent = await Route.createWorkerAgent(llm, [createMeasureControlTool], systemPrompt)
    return RunnableLambda.from(async (state: CalculationAgentState) => {
      const context = state.context || markdownModelCube(defaultModelCube())
      return {
        messages: [new HumanMessage(state.instructions)],
        role: state.role,
        context
      }
    }).pipe(Route.createRunWorkerAgent(agent, MEASURE_CONTROL_AGENT_NAME))
  }
}

export function injectCreateMeasureControlTool(
  defaultModelCube: Signal<{ dataSource: string; cube: EntityType }>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)

  const createMeasureControlTool = new DynamicStructuredTool({
    name: 'createMeasureControl',
    description: 'Create measures control to select actual measure in runtime',
    schema: z.object({
      dataSettings: DataSettingsSchema.optional(),
      property: MeasureControlSchema
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
            calculationType: CalculationType.MeasureControl
          } as MeasureControlProperty
        })

        logger.debug(`Measure control calculation measure created: `, _dataSettings, property)

        callback(_dataSettings, key)

        return `Measure control created!`
      } catch (error: any) {
        return `Error creating measure control: ${error.message}`
      }
    }
  })

  return createMeasureControlTool
}
