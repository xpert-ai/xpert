import { computed, effect, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { START, StateGraph } from '@langchain/langgraph/web'
import { CreateGraphOptions, referencesCommandName, Team } from '@xpert-ai/copilot'
import { DataSettings, pick } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { injectAgentFewShotTemplate, injectExampleRetriever } from 'apps/cloud/src/app/@core/copilot'
import { formatDocumentsAsString } from 'langchain/util/document'
import { NGXLogger } from 'ngx-logger'
import { injectCreateCalculationGraph } from '../calculation'
import { injectCreatePageAgent } from '../page'
import { injectPickCubeTool } from '../tools'
import { injectCreateStyleGraph } from './style'
import { STORY_STYLE_COMMAND_NAME } from './style/types'
import { StoryAgentState, storyAgentState } from './types'

export function injectCreateStoryGraph() {
  // Default
  const defaultDataSettings = signal<DataSettings & { modelId: string }>(null)
  const router = inject(Router)
  const route = inject(ActivatedRoute)
  const logger = inject(NGXLogger)
  const storyService = inject(NxStoryService)
  const defaultModelCubePrompt = storyService.defaultModelCubePrompt

  const story = computed(() => {
    const story = storyService.storySignal()
    return story ? {
      ...pick(story, 'id', 'name', 'status', 'options'),
      points: story.points?.map((item) => pick(item, 'key', 'name'))
    } : null
  })

  const storyPoint = computed(() => {
    const storyPoint = storyService.currentStoryPoint()
    return storyPoint ? {
      ...pick(storyPoint, 'key', 'name', 'gridOptions'),
      widgets: storyPoint.widgets?.map((item) => pick(item, 'key', 'title', 'component', 'position'))
    } : null
  })

  const storyPrompt = computed(() => `Current story is:
${story() ? JSON.stringify(story()) : 'Empty'}
Current story page is:
${storyPoint() ? JSON.stringify(storyPoint()) : 'Empty'}`)

  const pickCubeTool = injectPickCubeTool()

  const createCalculationGraph = injectCreateCalculationGraph(
    defaultDataSettings,
    (dataSettings: DataSettings, key: string) => {
      logger.debug(
        `Created calculation '${key}' for dataSource '${dataSettings.dataSource}' entity '${dataSettings.entitySet}'`
      )
      router.navigate(['calculations', encodeURIComponent(dataSettings.entitySet), key], { relativeTo: route })
    }
  )

  const createPageAgent = injectCreatePageAgent()
  // const createWidgetGraph = injectCreateWidgetAgent()
  const createStyleAgent = injectCreateStyleGraph()

  const styleReferencesRetriever = injectExampleRetriever(referencesCommandName(STORY_STYLE_COMMAND_NAME), {
    k: 3,
    vectorStore: null
  })
  const styleFewShotPrompt = injectAgentFewShotTemplate(STORY_STYLE_COMMAND_NAME, { k: 1, vectorStore: null })

  return async ({ llm, checkpointer, interruptBefore, interruptAfter }: CreateGraphOptions) => {
    const calculationAgent = (await createCalculationGraph({ llm })).compile()
    const pageAgent = await createPageAgent({ llm })
    const styleAgent = await createStyleAgent({ llm })

    const tools = [pickCubeTool]
    const superAgent = await Team.createSupervisorAgent<StoryAgentState>(
      llm,
      [
        {
          name: 'style',
          description: 'Set global styles of the story'
        },
        {
          name: 'calcualtion',
          description: 'create a calculation measure for cube'
        },
        {
          name: 'page',
          description: 'Create a dashboard page for the analysis topic'
        }
        // {
        //   name: 'widget',
        //   description: 'create a widget in story dashboard'
        // },
      ],
      tools,
      `You are a data analyst who wants to create a story dashboard.
{role}
{language}
{context}
Reference Documentations:
{references}

Story dashbaord usually consists of multiple pages, each page is an analysis topic.
- The filter bar usually contains 3 to 8 important dimension filters, not too many.

{story}

If there is no default cube, please call the 'pickCube' tool to pick a cube.
`
    )

    // const widgetAgent = await createWidgetGraph({ llm })
    const superGraph = new StateGraph({ channels: storyAgentState })
      // Add steps nodes
      .addNode(
        Team.SUPERVISOR_NAME,
        RunnableLambda.from(async (state: StoryAgentState) => {
          return await superAgent({ ...state, context: state.context || defaultModelCubePrompt(), story: storyPrompt() })
        }).withConfig({ runName: Team.SUPERVISOR_NAME })
      )
      .addNode(Team.TOOLS_NAME, new ToolNode<StoryAgentState>(tools))
      .addNode(
        'calculation',
        RunnableLambda.from(async (state: StoryAgentState) => {
          const { messages } = await calculationAgent.invoke({
            input: state.instructions,
            messages: [new HumanMessage(state.instructions)],
            role: state.role,
            context: state.context,
            language: state.language
          })
          return Team.responseToolMessage(state.tool_call_id, messages)
        })
      )
      .addNode(
        'page',
        RunnableLambda.from(async (state: StoryAgentState) => {
          const messages = await pageAgent.invoke({
            input: state.instructions,
            role: state.role,
            context: state.context,
            language: state.language,
            messages: []
          })

          return Team.responseToolMessage(state.tool_call_id, messages)
        })
      )
      // .addNode(
      //   'widget',
      //   RunnableLambda.from(async (state: StoryAgentState) => {
      //     const messages = await widgetAgent.invoke({
      //       input: state.instructions,
      //       messages: [new HumanMessage(state.instructions)],
      //       role: state.role,
      //       context: state.context,
      //       language: state.language
      //     })

      //     return Team.responseToolMessage(state.tool_call_id, messages)
      //   })
      // )
      .addNode(
        'style',
        RunnableLambda.from(async (state: StoryAgentState) => {
          const content = await styleFewShotPrompt.format({ input: state.instructions, context: '' })
          const references = await styleReferencesRetriever.pipe(formatDocumentsAsString).invoke(content)
          const { messages } = await styleAgent.invoke({
            input: state.instructions,
            messages: [new HumanMessage(content)],
            role: state.role,
            context: state.context,
            language: state.language,
            references
          })

          return Team.responseToolMessage(state.tool_call_id, messages)
        })
      )
      .addEdge('calculation', Team.SUPERVISOR_NAME)
      .addEdge('page', Team.SUPERVISOR_NAME)
      // .addEdge('widget', Team.SUPERVISOR_NAME)
      .addEdge('style', Team.SUPERVISOR_NAME)
      .addEdge(Team.TOOLS_NAME, Team.SUPERVISOR_NAME)
      .addConditionalEdges(Team.SUPERVISOR_NAME, Team.supervisorRouter)
      .addEdge(START, Team.SUPERVISOR_NAME)

    return superGraph
  }
}
