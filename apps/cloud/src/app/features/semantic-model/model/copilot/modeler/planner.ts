import { Signal } from '@angular/core'
import { AIMessage, BaseMessage, isAIMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool, StructuredTool } from '@langchain/core/tools'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { END, START, StateGraph, StateGraphArgs } from '@langchain/langgraph/web'
import { ChatOpenAI } from '@langchain/openai'
import { PropertyDimension } from '@metad/ocap-core'
import { IPlanState } from './types'

export async function createModelerPlanner({
  llm,
  selectTablesTool,
  queryTablesTool,
  dimensions
}: {
  llm: ChatOpenAI
  selectTablesTool: DynamicStructuredTool
  queryTablesTool: DynamicStructuredTool
  dimensions: Signal<PropertyDimension[]>
}) {
  const tools = [selectTablesTool, queryTablesTool]

  const plannerPrompt = await ChatPromptTemplate.fromMessages([
    ['system', `You are a cube modeler for data analysis, now you need create a plan for the final goal.` +
      ` If user-provided tables, consider which of them are used to create shared dimensions and which are used to create cubes.` +
      ` Or use the 'selectTables' tool to get all tables then select the required physical tables from them.` +
      ` If the dimension required for modeling is in the following existing shared dimensions, please do not put it in the plan, just use it directly in the cube creation task` +
      ` A plan is an array of independent, ordered steps.` +
      ` Each step of the plan corresponds to one of the tasks 'Create a shared dimension' and 'Create a cube'. ` +
      ' This plan should involve individual tasks, that if executed correctly will yield the correct answer. Do not add any superfluous steps.' +
      ' The result of the final step should be the final answer. Make sure that each step has all the information needed - do not skip steps.\n\n' +
      `Objective is: {objective}`],
    ['user', `{dimensions}`]
  ]).partial({
    dimensions: () => dimensions().length ? 
      `Existing shared dimensions:\n` + dimensions()
        .map((d) => `- name: ${d.name}\n  caption: ${d.caption || ''}`)
        .join('\n')
        : `There are no existing shared dimensions.`
  })

  return createPlannerReactAgent({ llm, tools, systemMessage: plannerPrompt })
}

export function createPlannerReactAgent(props: {
  llm: ChatOpenAI
  tools: StructuredTool[]
  systemMessage: ChatPromptTemplate
}) {
  const { llm, tools, systemMessage } = props

  const schema: StateGraphArgs<IPlanState>['channels'] = {
    messages: {
      value: (left: BaseMessage[], right: BaseMessage[]) => left.concat(right),
      default: () => []
    },
    objective: {
      value: (left: string, right: string) => right ?? left ?? '',
      default: () => ''
    }
  }

  const endict = new RunnableLambda({
    func: ({ objective, messages }: IPlanState) => ({ objective, messages })
  })

  const prompt = ChatPromptTemplate.fromMessages([systemMessage, ['placeholder', '{messages}']])

  const boundModel = endict.pipe(prompt).pipe(
    llm.bindTools([
      ...tools,
    ])
  )

  const toolNode = new ToolNode<{ messages: BaseMessage[] }>(tools)

  // Define the function that determines whether to continue or not
  const route = (state: IPlanState) => {
    const { messages } = state
    const lastMessage = messages[messages.length - 1];
    if (
      isAIMessage(lastMessage) &&
      (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0)
    ) {
      return END;
    }

    // Otherwise we continue
    return 'tools'
  }

  // Define the function that calls the model
  const callModel = async (state: IPlanState, config?: any) => {
    const response = await boundModel.invoke(state)
    // We return an object, because this will get added to the existing list
    return { messages: [response] }
  }

  // Define a new graph
  const workflow = new StateGraph<IPlanState>({
    channels: schema
  })
    .addNode('agent', callModel)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges(
      // First, we define the start node. We use `agent`.
      // This means these are the edges taken after the `agent` node is called.
      'agent',
      // Next, we pass in the function that will determine which node is called next.
      route
    )
    // We now add a normal edge from `tools` to `agent`.
    // This means that after `tools` is called, `agent` node is called next.
    .addEdge('tools', 'agent')

  // // Finally, we compile it!
  // // This compiles it into a LangChain Runnable,
  // // meaning you can use it as you would any other runnable
  // const app = workflow.compile()

  return workflow
}