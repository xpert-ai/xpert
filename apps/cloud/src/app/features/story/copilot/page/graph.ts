import { inject } from '@angular/core'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { CreateGraphOptions, createReactAgent, referencesCommandName } from '@xpert-ai/copilot'
import { injectAgentFewShotTemplate, injectExampleRetriever } from 'apps/cloud/src/app/@core/copilot'
import { formatDocumentsAsString } from 'langchain/util/document'
import { NGXLogger } from 'ngx-logger'
import {
  injectCreateChartTool,
  injectCreateFilterBarTool,
  injectCreateInputControlTool,
  injectCreateKPITool,
  injectCreateTableTool,
  injectCreateVariableTool
} from '../tools'
import { injectCreatePageTools } from './tools'
import { PageAgentState, pageAgentState, STORY_PAGE_COMMAND_NAME } from './types'

export function injectCreatePageGraph() {
  const logger = inject(NGXLogger)
  const tools = injectCreatePageTools()
  const createFilterBar = injectCreateFilterBarTool()
  const createKPI = injectCreateKPITool()
  const createVariable = injectCreateVariableTool()
  const createInputControl = injectCreateInputControlTool()
  const createChart = injectCreateChartTool()
  const createTable = injectCreateTableTool()

  return async ({ llm, interruptBefore, interruptAfter }: CreateGraphOptions) => {
    return createReactAgent({
      state: pageAgentState,
      llm,
      interruptBefore,
      interruptAfter,
      tools: [...tools, createFilterBar, createKPI, createVariable, createInputControl, createChart, createTable],
      messageModifier: async (state) => {
        const systemTemplate = `You are a BI analysis expert.
{{role}}
{{language}}
Reference Documentations:
{{references}}

Widget 类型分为 Text, FilterBar, InputControl, Table, Chart, and KPI。

- 页面 layout 布局默认是 40 * 40.
- When creating a FilterBar widget, if there are variables in the cube, please add the variables (Use variable name as dimension) to the Filterbar dimensions first.
- When creating a table widget, try to use the top level of the dimension to avoid excessive data size.

The cube context:
{{context}}
`
        const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
          templateFormat: 'mustache'
        }).format(state)
        return [new SystemMessage(system), ...state.messages]
      }
    })
  }
}

export function injectCreatePageAgent() {
  const createPageGraph = injectCreatePageGraph()
  const fewShotPrompt = injectAgentFewShotTemplate(STORY_PAGE_COMMAND_NAME, { k: 1, vectorStore: null })
  const referencesRetriever = injectExampleRetriever(referencesCommandName(STORY_PAGE_COMMAND_NAME), {
    k: 3,
    vectorStore: null
  })

  return async ({ llm }: CreateGraphOptions) => {
    const agent = await createPageGraph({ llm })

    return RunnableLambda.from(async (state: PageAgentState) => {
      const references = await referencesRetriever.pipe(formatDocumentsAsString).invoke(state.input)
      const content = await fewShotPrompt.format({ input: state.input })

      const { messages } = await agent.invoke({
        input: state.input,
        messages: [new HumanMessage(content)],
        role: state.role,
        language: state.language,
        context: state.context,
        references
      })

      return messages
    })
  }
}
