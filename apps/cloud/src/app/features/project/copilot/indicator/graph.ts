import { computed, inject } from '@angular/core'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { START, StateGraph, StateGraphArgs } from '@langchain/langgraph/web'
import { CreateGraphOptions, Team } from '@metad/copilot'
import { AgentState } from '@metad/copilot-angular'
import { injectDimensionMemberTool } from '@metad/core'
import { injectAgentFewShotTemplate } from '../../../../@core/copilot/'
import { ProjectService } from '../../project.service'
import { createIndicatorWorker } from './indicator-agent'
import { injectCreateFormulaTool, injectCreateIndicatorTool, injectPickCubeTool } from './tools'
import { INDICATOR_AGENT_NAME, IndicatorCommandName, SUPERVISOR_NAME } from './types'

// Define the top-level State interface
interface State extends Team.State {
  indicator: string
}

const superState: StateGraphArgs<State>['channels'] = {
  ...Team.createState(),
  indicator: {
    value: (x: string, y?: string) => y ?? x,
    default: () => ''
  },
}

export function injectCreateIndicatorGraph() {
  const projectService = inject(ProjectService)
  const createIndicatorTool = injectCreateIndicatorTool()
  const pickCubeTool = injectPickCubeTool()
  const memberRetrieverTool = injectDimensionMemberTool()
  const createFormulaTool = injectCreateFormulaTool()

  const indicatorCodes = computed(() => projectService.indicators()?.map((indicator) => indicator.code) ?? [])
  const businessAreas = projectService.businessAreas
  const tags = projectService.tags

  return async ({ llm, checkpointer, interruptBefore, interruptAfter }: CreateGraphOptions) => {
    const supervisorNode = await Team.createSupervisor(llm, [
      {
        name: INDICATOR_AGENT_NAME,
        description: 'The agent will create indicator, only one at a time'
      }
    ])

    const createIndicator = await createIndicatorWorker(
      {
        llm,
        indicatorCodes,
        businessAreas,
        tags
      },
      [pickCubeTool, memberRetrieverTool, createFormulaTool, createIndicatorTool]
    )

    const superGraph = new StateGraph({ channels: superState })
      // Add steps nodes
      .addNode(SUPERVISOR_NAME, supervisorNode)
      .addNode(INDICATOR_AGENT_NAME,
        async (state: State, config?: RunnableConfig) => {
          const result = await createIndicator.invoke({
            role: state.role,
            context: state.context,
            references: state.references,
            indicator: state.indicator,
            messages: [
              new HumanMessage(state.instructions)
            ]
          }, config)
          return {
            messages: [new HumanMessage({ content: result.output, name: INDICATOR_AGENT_NAME })],
            indicator: result.output
          }
        })

    superGraph.addEdge(INDICATOR_AGENT_NAME, SUPERVISOR_NAME)
    superGraph.addConditionalEdges(SUPERVISOR_NAME, (x) => x.next)

    superGraph.addEdge(START, SUPERVISOR_NAME)

    return superGraph.compile({ checkpointer, interruptBefore, interruptAfter })
  }
}

export function injectRunIndicatorAgent() {
  const createIndicatorGraph = injectCreateIndicatorGraph()
  const fewShotPrompt = injectAgentFewShotTemplate(IndicatorCommandName, { k: 1, vectorStore: null })

  return async ({ llm, checkpointer }: CreateGraphOptions) => {
    const agent = await createIndicatorGraph({ llm })

    return RunnableLambda.from(async (state: AgentState) => {
      const content = await fewShotPrompt.format({ input: state.input, context: state.context })
      return {
        input: state.input,
        messages: [new HumanMessage(content)],
        role: state.role,
        context: state.context,
        references: state.references,
      }
    }).pipe(agent) as any
  }
}
