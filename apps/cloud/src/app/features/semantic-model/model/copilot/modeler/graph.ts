import { Signal } from '@angular/core'
import { Runnable } from '@langchain/core/runnables'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { END, START, StateGraph, StateGraphArgs } from '@langchain/langgraph/web'
import { ChatOpenAI } from '@langchain/openai'
import { PropertyDimension } from '@metad/ocap-core'
import { Team } from 'apps/cloud/src/app/@core/copilot'
import { CUBE_MODELER_NAME } from '../cube/graph'
import { DIMENSION_MODELER_NAME } from '../dimension/graph'
import { createModelerPlanner } from './planner'
import { createSupervisor } from './supervisor'
import { PLANNER_NAME, SUPERVISOR_NAME, State } from './types'

const superState: StateGraphArgs<State>['channels'] = {
  ...Team.createState(),
  plan: {
    value: (x?: string[], y?: string[]) => y ?? x ?? [],
    default: () => []
  }
}

export async function createModelerGraph({
  llm,
  dimensionModeler,
  cubeModeler,
  selectTablesTool,
  queryTablesTool,
  dimensions
}: {
  llm: ChatOpenAI
  dimensionModeler: Runnable
  cubeModeler: Runnable
  selectTablesTool: DynamicStructuredTool
  queryTablesTool: DynamicStructuredTool
  dimensions: Signal<PropertyDimension[]>
}) {
  const supervisorNode = await createSupervisor(llm, [PLANNER_NAME, DIMENSION_MODELER_NAME, CUBE_MODELER_NAME])
  const planner = (await createModelerPlanner({ llm, selectTablesTool, queryTablesTool, dimensions })).compile()

  async function runPlanner(state: State): Promise<any> {
    const plan = await planner.invoke({ objective: state.messages.map((m) => m.content).join('\n') })
    return { messages: [plan.messages[plan.messages.length - 1]] }
  }

  const superGraph = new StateGraph({ channels: superState })
    // Add steps nodes
    .addNode(PLANNER_NAME, runPlanner)
    .addNode(DIMENSION_MODELER_NAME, Team.getInstructions.pipe(dimensionModeler).pipe(Team.joinGraph))
    .addNode(CUBE_MODELER_NAME, Team.getInstructions.pipe(cubeModeler).pipe(Team.joinGraph))
    .addNode(SUPERVISOR_NAME, supervisorNode)

  superGraph.addEdge(PLANNER_NAME, SUPERVISOR_NAME)
  superGraph.addEdge(DIMENSION_MODELER_NAME, SUPERVISOR_NAME)
  superGraph.addEdge(CUBE_MODELER_NAME, SUPERVISOR_NAME)
  superGraph.addConditionalEdges(SUPERVISOR_NAME, (x) => x.next, {
    [PLANNER_NAME]: PLANNER_NAME,
    [DIMENSION_MODELER_NAME]: DIMENSION_MODELER_NAME,
    [CUBE_MODELER_NAME]: CUBE_MODELER_NAME,
    FINISH: END
  })

  superGraph.addEdge(START, SUPERVISOR_NAME)

  return superGraph
}