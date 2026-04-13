import { inject } from '@angular/core'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { CreateGraphOptions, createReactAgent } from '@xpert-ai/copilot'
import {
  injectDimensionMemberTool,
  makeCubeRulesPrompt,
  markdownEntityType,
  PROMPT_RETRIEVE_DIMENSION_MEMBER
} from '@xpert-ai/core'
import { DataSettings, pick } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { NGXLogger } from 'ngx-logger'
import { firstValueFrom } from 'rxjs'
import {
  injectCreateChartTool,
  injectCreateFilterBarTool,
  injectCreateInputControlTool,
  injectCreateKPITool,
  injectCreateTableTool,
  injectCreateVariableTool,
  injectPickCubeTool
} from '../tools'
import { WidgetAgentState, widgetAgentState } from './types'

export function injectCreateWidgetGraph() {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)
  const defaultModelCubePrompt = storyService.defaultModelCubePrompt

  const memberRetrieverTool = injectDimensionMemberTool()

  const createTableTool = injectCreateTableTool()
  const createChartTool = injectCreateChartTool()
  const pickCubeTool = injectPickCubeTool()
  const createKPITool = injectCreateKPITool()
  const createFilterBar = injectCreateFilterBarTool()
  const createVariable = injectCreateVariableTool()
  const createInputControl = injectCreateInputControlTool()

  return async ({ llm, interruptBefore, interruptAfter }: CreateGraphOptions) => {
    const widget = storyService.currentWidget
    return createReactAgent({
      state: widgetAgentState,
      llm,
      interruptBefore,
      interruptAfter,
      tools: [
        pickCubeTool,
        memberRetrieverTool,
        createFilterBar,
        createVariable,
        createInputControl,
        createTableTool,
        createChartTool,
        createKPITool
      ],
      messageModifier: async (state) => {
        let context = null
        if (widget()?.dataSettings?.entitySet) {
          const entityType = await firstValueFrom(
            storyService.selectEntityType(pick(widget().dataSettings, 'dataSource', 'entitySet') as DataSettings)
          )
          if (entityType) {
            //@todo 还需要 modelId 信息
            context = markdownEntityType(entityType)
          }
        }
        const systemTemplate = `You are a BI analysis expert. Please use MDX technology to edit or create chart or table widget configurations based on Cube information.
{{role}}
{{language}}
References documents:
{{references}}

If no cube context is provided, please first call the 'pickCube' tool to choose a cube.

${makeCubeRulesPrompt()}

${PROMPT_RETRIEVE_DIMENSION_MEMBER}
A dimension can only be used once, and a hierarchy cannot appear on multiple independent axes.

The cube context:
{{context}}

Current widget:
${widget() ? JSON.stringify(pick(widget(), 'key', 'title', 'component', 'dataSettings', 'options')) : 'No widget.'}
`
        const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
          templateFormat: 'mustache'
        }).format({ ...state, context: state.context || context || defaultModelCubePrompt() })
        return [new SystemMessage(system), ...state.messages]
      }
    })
  }
}

export function injectCreateWidgetAgent() {
  const logger = inject(NGXLogger)
  const createAgent = injectCreateWidgetGraph()

  return async ({ llm }: CreateGraphOptions) => {
    const agent = await createAgent({ llm })
    return RunnableLambda.from(async (state: WidgetAgentState) => {
      const { messages } = await agent.invoke({
        input: state.input,
        messages: [new HumanMessage(state.input)],
        role: state.role,
        language: state.language,
        context: state.context
      })

      return messages
    })
  }
}
