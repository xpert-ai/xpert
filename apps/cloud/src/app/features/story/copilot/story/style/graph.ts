import { inject } from '@angular/core'
import { SystemMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { CreateGraphOptions, createReactAgent } from '@xpert-ai/copilot'
import { pick } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { NGXLogger } from 'ngx-logger'
import { injectLayoutTool, injectModifyStyleTool, injectUpdateStoryOptionsTool } from './tools'
import { storyStyleAgentState } from './types'

/**
 * 故事样式与布局
 * - 全局样式
 * - 当前页面布局规划
 * -
 */
export function injectCreateStyleGraph() {
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)
  const modifyStyleTool = injectModifyStyleTool()
  const layoutTool = injectLayoutTool()
  const updateStoryOptionsTool = injectUpdateStoryOptionsTool()

  const tools = [modifyStyleTool, updateStoryOptionsTool, layoutTool]

  return async ({ llm, checkpointer, interruptBefore, interruptAfter }: CreateGraphOptions) => {
    return createReactAgent({
      state: storyStyleAgentState,
      llm,
      interruptBefore,
      interruptAfter,
      checkpointSaver: checkpointer,
      tools: [...tools],
      messageModifier: async (state) => {
        const gridOptions = storyService.currentStoryPoint()?.gridOptions
        const widgets = storyService.currentStoryPoint()?.widgets
        const systemTemplate = `You are a BI analysis expert and are configuring the dashboard globally.
{{role}}
{{language}}
{{context}}
References documents:
{{references}}

当前页面使用的是 angular-gridster2 框架构建，其配置为：
${JSON.stringify(gridOptions)}
${widgets ? `当前页面内的 widgets 有以下：
${JSON.stringify(widgets.map((widget) => pick(widget, 'key', 'title', 'component', 'position')))}` : `当前故事为空`}

- 其中 widget's position 是其在 grid 中的位置和大小。

修改故事仪表板样式 或者 对页面内 widgets 重新布局（调整大小和位置）。
`

        const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
          templateFormat: 'mustache'
        }).format(state)
        return [new SystemMessage(system), ...state.messages]
      }
    })
  }
}
