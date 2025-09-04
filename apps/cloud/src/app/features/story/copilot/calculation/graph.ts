import { computed, inject, Signal } from '@angular/core'
import { HumanMessage } from '@langchain/core/messages'
import { FewShotPromptTemplate } from '@langchain/core/prompts'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { END, START, StateGraph, StateGraphArgs } from '@langchain/langgraph/web'
import { CreateGraphOptions, Team } from '@metad/copilot'
import { injectDimensionMemberTool, markdownModelCube } from '@metad/core'
import { DataSettings, EntityType } from '@metad/ocap-core'
import { injectAgentFewShotTemplate, Route } from '../../../../@core/copilot/'
import { createConditionalAggregationWorker } from './agent-cond-aggr'
import { createFormulaWorker } from './agent-formula'
import { createVarianceMeasureWorker } from './agent-variance'
import {
  CONDITIONAL_AGGREGATION_AGENT_NAME,
  FORMULA_AGENT_NAME,
  MEASURE_CONTROL_AGENT_NAME,
  RESTRICTED_AGENT_NAME,
  SUPERVISOR_NAME,
  CalculationAgentState,
  VARIANCE_AGENT_NAME
} from './types'
import { AgentExecutor } from 'langchain/agents'
import { injectPickCubeTool } from '../tools'
import { injectCreateConditionalAggregationTool, injectCreateFormulaMeasureTool, injectCreateVarianceMeasureTool } from './tools'
import { injectCreateRestrictedMeasureWorker } from './agent-restricted'
import { injectCreateMeasureControlWorker } from './agent-measure-control'
import { derivedAsync } from 'ngxtension/derived-async'
import { NxStoryService } from '@metad/story/core'
import { of } from 'rxjs'

const superState: StateGraphArgs<CalculationAgentState>['channels'] = {
  ...Team.createState(),
  tool_call_id: {
    value: (x: string, y?: string) => y,
    default: () => null
  },
}

export async function createCalculationGraph({
  llm,
  checkpointer,
  formulaFewShotPrompt,
  condAggrFewShotPrompt,
  varianceFewShotPrompt,
  defaultModelCube,
  pickCubeTool,
  memberRetrieverTool,
  createFormulaTool,
  restrictedMeasureWorker,
  createConditionalAggregationTool,
  createVarianceMeasureTool,
  runMeasureControlWorker
}: CreateGraphOptions & {
  formulaFewShotPrompt: FewShotPromptTemplate
  condAggrFewShotPrompt: FewShotPromptTemplate
  varianceFewShotPrompt: FewShotPromptTemplate
  defaultModelCube: Signal<{ modelId: string; dataSource: string; cube: EntityType }>
  pickCubeTool?: DynamicStructuredTool
  memberRetrieverTool?: DynamicStructuredTool
  createFormulaTool?: DynamicStructuredTool
  restrictedMeasureWorker?: (options: CreateGraphOptions) => Promise<AgentExecutor>
  createConditionalAggregationTool?: DynamicStructuredTool
  createVarianceMeasureTool?: DynamicStructuredTool
  runMeasureControlWorker: (options: CreateGraphOptions) => Promise<Runnable>
}) {
  const supervisorNode = await Team.createSupervisor(
    llm,
    [
      {
        name: RESTRICTED_AGENT_NAME,
        description: 'This agent allows the creation of measures that aggregate values based on restrictions imposed by dimension members. It is useful when you need to filter or limit the data aggregation to specific members of a dimension.'
      },
      {
        name: CONDITIONAL_AGGREGATION_AGENT_NAME,
        description: 'This agent provides the ability to create aggregated measures based on various operations and dimensions. It supports operations such as Count, Sum, TopCount, TopSum, Min, Max, and Avg. This function is suitable when you need to perform different types of aggregations based on certain conditions.'
      },
      {
        name: VARIANCE_AGENT_NAME,
        description: 'This agent is designed to create measures that calculate the variance or ratio between different members within a dimension. It is useful for comparing data, such as year-over-year changes, month-over-month changes, differences between versions, or differences between accounts.'
      },
      {
        name: FORMULA_AGENT_NAME,
        description: 'When none of the above agents can meet the requirements, this agent allows the creation of calculated measures using MDX (Multidimensional Expressions) formulas. It provides the flexibility to define complex calculations and custom aggregations.'
      },
      {
        name: MEASURE_CONTROL_AGENT_NAME,
        description: 'This agent create a calculation measure that allows the selection among multiple measures. It is useful when you need to provide users with the ability to choose from different measures dynamically.'
      }
    ],
    `You are a supervisor responsible for selecting one of the following workers:
{team_members}

Based on the following user request, select an appropriate worker to create a calculation measure.
When finished, respond FINISH. Choose strategically to minimize the number of steps taken.

{role}

The dataset context:
{context}
Reference Documentations:
{references}`)

  const createFormulaAgent = await createFormulaWorker({
    llm,
    tools: [pickCubeTool, memberRetrieverTool, createFormulaTool]
  })
  const createRestrictedMeasureAgent = await restrictedMeasureWorker({llm})
  const createConditionalAggregationAgent = await createConditionalAggregationWorker({
    llm,
    tools: [memberRetrieverTool, createConditionalAggregationTool]
  })
  const createVarianceMeasureAgent = await createVarianceMeasureWorker({
    llm,
    tools: [memberRetrieverTool, createVarianceMeasureTool]
  })

  const runCreateFormulaAgent = RunnableLambda.from(async (state: CalculationAgentState) => {
    const context = state.context || markdownModelCube(defaultModelCube())
    const input = await formulaFewShotPrompt.format({
      input: state.instructions,
      context
    })
    return {
      messages: [new HumanMessage(input)],
      role: state.role,
      context
    }
  })

  const runCreateConditionalAggregationAgent = RunnableLambda.from(async (state: CalculationAgentState) => {
    const context = state.context || markdownModelCube(defaultModelCube())
    const input = await condAggrFewShotPrompt.format({
      input: state.instructions,
      context
    })
    return {
      messages: [new HumanMessage(input)],
      role: state.role,
      context
    }
  })

  const runCreateVarianceMeasureAgent = RunnableLambda.from(async (state: CalculationAgentState) => {
    const context = state.context || markdownModelCube(defaultModelCube())
    const input = await varianceFewShotPrompt.format({
      input: state.instructions,
      context
    })
    return {
      messages: [new HumanMessage(input)],
      role: state.role,
      context
    }
  })

  const runCalculationAgent = RunnableLambda.from(async (state: CalculationAgentState) => {
    const context = state.context || markdownModelCube(defaultModelCube())
    return {
      messages: [new HumanMessage(state.instructions)],
      role: state.role,
      context
    }
  })

  const superGraph = new StateGraph({ channels: superState })
    // Add steps nodes
    .addNode(SUPERVISOR_NAME, supervisorNode)
    .addNode(
      FORMULA_AGENT_NAME,
      runCreateFormulaAgent.pipe(Route.createRunWorkerAgent(createFormulaAgent, FORMULA_AGENT_NAME))
    )
    .addNode(
      RESTRICTED_AGENT_NAME,
      runCalculationAgent.pipe(Route.createRunWorkerAgent(createRestrictedMeasureAgent, RESTRICTED_AGENT_NAME))
    )
    .addNode(
      CONDITIONAL_AGGREGATION_AGENT_NAME,
      runCreateConditionalAggregationAgent.pipe(
        Route.createRunWorkerAgent(createConditionalAggregationAgent, CONDITIONAL_AGGREGATION_AGENT_NAME)
      )
    )
    .addNode(
      VARIANCE_AGENT_NAME,
      runCreateVarianceMeasureAgent.pipe(Route.createRunWorkerAgent(createVarianceMeasureAgent, VARIANCE_AGENT_NAME))
    )
    .addNode(MEASURE_CONTROL_AGENT_NAME, await runMeasureControlWorker({ llm }))

  superGraph.addEdge(FORMULA_AGENT_NAME, SUPERVISOR_NAME)
  superGraph.addEdge(RESTRICTED_AGENT_NAME, SUPERVISOR_NAME)
  superGraph.addEdge(CONDITIONAL_AGGREGATION_AGENT_NAME, SUPERVISOR_NAME)
  superGraph.addEdge(VARIANCE_AGENT_NAME, SUPERVISOR_NAME)
  superGraph.addEdge(MEASURE_CONTROL_AGENT_NAME, SUPERVISOR_NAME)
  superGraph.addConditionalEdges(SUPERVISOR_NAME, (x) => x.next, {
    [FORMULA_AGENT_NAME]: FORMULA_AGENT_NAME,
    [RESTRICTED_AGENT_NAME]: RESTRICTED_AGENT_NAME,
    [CONDITIONAL_AGGREGATION_AGENT_NAME]: CONDITIONAL_AGGREGATION_AGENT_NAME,
    [VARIANCE_AGENT_NAME]: VARIANCE_AGENT_NAME,
    [MEASURE_CONTROL_AGENT_NAME]: MEASURE_CONTROL_AGENT_NAME,
    FINISH: END
  })

  superGraph.addEdge(START, SUPERVISOR_NAME)

  return superGraph as any
}

export function injectCreateCalculationGraph(
  defaultDataSettings: Signal<DataSettings & { modelId: string }>,
  callback: (dataSettings: DataSettings, key: string) => void
) {
  const storyService = inject(NxStoryService)
  
  const defaultCube = derivedAsync(() => {
    const dataSettings = defaultDataSettings()
    return dataSettings ? storyService.selectEntityType(dataSettings) : of(null)
  })
  const defaultModelCube = computed(() => {
    const dataSettings = defaultDataSettings()
    const cube = defaultCube()
    return { dataSource: dataSettings?.dataSource, modelId: dataSettings.modelId, cube }
  })
  
  const formulaFewShotPrompt = injectAgentFewShotTemplate(`calculated`, { vectorStore: null, score: 0.7, k: 5 })
  const condAggrFewShotPrompt = injectAgentFewShotTemplate(`calculation/aggregation`, {
    vectorStore: null,
    score: 0.7,
    k: 5
  })
  const varianceFewShotPrompt = injectAgentFewShotTemplate(`calculation/variance`, {
    vectorStore: null,
    score: 0.7,
    k: 5
  })

  const pickCubeTool = injectPickCubeTool()
  const memberRetrieverTool = injectDimensionMemberTool()

  const createFormulaTool = injectCreateFormulaMeasureTool(defaultDataSettings, callback)
  const createConditionalAggregationTool = injectCreateConditionalAggregationTool(defaultDataSettings, callback)
  const createVarianceMeasureTool = injectCreateVarianceMeasureTool(defaultDataSettings, callback)

  const restrictedMeasureWorker = injectCreateRestrictedMeasureWorker(defaultModelCube, callback)
  const runMeasureControlWorker = injectCreateMeasureControlWorker(defaultModelCube, callback)

  return async ({ llm, checkpointer }: CreateGraphOptions) => {
    return await createCalculationGraph({
      llm,
      checkpointer,
      formulaFewShotPrompt,
      condAggrFewShotPrompt,
      varianceFewShotPrompt,
      defaultModelCube,
      pickCubeTool,
      memberRetrieverTool,
      createFormulaTool,
      restrictedMeasureWorker,
      createConditionalAggregationTool,
      createVarianceMeasureTool,
      runMeasureControlWorker
    })
  }
}