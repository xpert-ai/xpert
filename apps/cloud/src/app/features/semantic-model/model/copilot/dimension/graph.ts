import { inject } from '@angular/core'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { StateGraphArgs } from '@langchain/langgraph/web'
import { createCopilotAgentState, CreateGraphOptions, createReactAgent, Team } from '@metad/copilot'
import { AgentState } from '@metad/copilot-angular'
import {
  injectAgentFewShotTemplate
} from 'apps/cloud/src/app/@core/copilot'
import { SemanticModelService } from '../../model.service'
import { injectQueryTablesTool, injectSelectTablesTool } from '../tools'
import { injectCreateDimensionTool, injectCreateHierarchyTool } from './tools'
import { DimensionCommandName, timeLevelFormatter } from './types'

export const CreateDimensionSystemPrompt =
  `You are a cube modeling expert. Let's directly call the tool to create a shared dimension for the cube!` +
  ` If the user does not provide a dimension table, use 'selectTables' tool to get the table, and then select a table related to the requirement to create a dimension.` +
  ` If the user does not provide the table field information, use the 'queryTables' tool to obtain the table field structure.` +
  ` If the user wants to add an analysis scenario for the current dimension, please call 'createHierarchy' to add the corresponding hierarchy of the dimension.` +
  ` The dimension name don't be the same as the table name, It is not necessary to convert all table fields into levels. The levels are arranged in order of granularity from coarse to fine, based on the business data represented by the table fields, for example table: product (id, name, product_category, product_family) to levels: [product_family, product_category, name].` +
  ` Use the primary key of the dimension table or the most granular level field as the 'primaryKey'.` +
  '\n' +
  timeLevelFormatter()

export function injectDimensionModeler() {
  const modelService = inject(SemanticModelService)
  const createDimensionTool = injectCreateDimensionTool()
  const createHierarchyTool = injectCreateHierarchyTool()
  const selectTablesTool = injectSelectTablesTool()
  const queryTablesTool = injectQueryTablesTool()

  const dimensions = modelService.dimensions

  const systemContext = async () => {
    return (
      `The dimension name cannot be any of the share dimension names in the list: [${dimensions()
        .map((d) => d.name)
        .join(', ')}].` + ` Return the 'name' and 'caption' fields of the dimension.`
    )
  }

  return async ({ llm, checkpointer }: CreateGraphOptions) => {
    const state: StateGraphArgs<AgentState>['channels'] = createCopilotAgentState()
    return createReactAgent({
      llm,
      checkpointSaver: checkpointer,
      state,
      tools: [selectTablesTool, queryTablesTool, createDimensionTool, createHierarchyTool],
      messageModifier: async (state) => {
        const system = await SystemMessagePromptTemplate.fromTemplate(
          CreateDimensionSystemPrompt + `\n\n${await systemContext()}\n\n` + `{context}`
        ).format(state as any)
        return [new SystemMessage(system), ...state.messages]
      }
    })
  }
}

export function injectRunDimensionModeler() {
  const createDimensionModeler = injectDimensionModeler()
  const fewShotPrompt = injectAgentFewShotTemplate(DimensionCommandName, { k: 1, vectorStore: null })

  return async ({ llm, checkpointer }: CreateGraphOptions) => {
    const agent = await createDimensionModeler({ llm, checkpointer })

    return RunnableLambda.from(async (state: AgentState) => {
      const content = await fewShotPrompt.format({ input: state.input, context: '' })
      return {
        input: state.input,
        messages: [new HumanMessage(content)],
        role: state.role,
        context: state.context,
        language: state.language
      }
    })
      .pipe(agent)
      .pipe(Team.joinGraph)
  }
}
