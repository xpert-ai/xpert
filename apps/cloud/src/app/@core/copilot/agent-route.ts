import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, MessagesPlaceholder, TemplateFormat } from '@langchain/core/prompts'
import { Runnable, RunnableConfig } from '@langchain/core/runnables'
import { StructuredToolInterface } from '@langchain/core/tools'
import { PartialValues } from '@langchain/core/utils/types'
import { createCopilotAgentState } from '@metad/copilot'
import { AgentState } from '@metad/copilot-angular'
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents'
import { z } from 'zod'

type ZodAny = z.ZodObject<any, any, any, any>

/**
 * @deprecated use Team state
 */
export interface State extends AgentState {
  next: string
  instructions: string
  reasoning: string
}

export function createState() {
  return {
    ...createCopilotAgentState(),
    next: {
      value: (x: string, y?: string) => y ?? x,
      default: () => ''
    },
    instructions: {
      value: (x: string, y?: string) => y ?? x,
      default: () => "Resolve the user's request."
    },
    reasoning: {
      value: (x: string, y?: string) => y ?? x,
      default: () => ''
    }
  }
}

/**
 * Create agent executor for **worker** node in the route graph.
 * The worker will execute the task given by the supervisor then return the result back to the supervisor.
 *
 * @param llm
 * @param tools
 * @param systemPrompt
 * @returns
 */
export async function createWorkerAgent<NewPartialVariableName extends string>(
  llm: BaseChatModel,
  tools: any[],
  systemPrompt: string,
  partialValues?: PartialValues<NewPartialVariableName>,
  templateFormat?: TemplateFormat
): Promise<AgentExecutor> {
  // Each worker node will be given a name and some tools.
  const _prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    new MessagesPlaceholder('messages'),
    new MessagesPlaceholder('agent_scratchpad')
  ], {
    templateFormat
  })
  let prompt = _prompt
  if (partialValues) {
    prompt = await _prompt.partial(partialValues)
  }

  const agent = await createOpenAIToolsAgent({ llm, tools, prompt })
  return new AgentExecutor({ agent, tools })
}

/**
 * Create a function for run the **worker** agent in graph.
 *
 * @param agent
 * @param name
 * @returns
 */
export function createRunWorkerAgent<S>(agent: AgentExecutor, name: string) {
  return async function runWorkerAgent(state: S, config?: RunnableConfig) {
    const result = await agent.invoke(state, config)
    return {
      messages: [new HumanMessage({ content: result.output, name })]
    }
  }
}

export async function runAgentNode<T>(params: {
  state: T
  agent: Runnable
  name: string
  config?: RunnableConfig & {
    config: RunnableConfig
  } & Record<string, any>
}) {
  const { state, agent, name, config } = params
  const result = await agent.invoke(state, config)
  return {
    messages: [new HumanMessage({ content: result.output, name })]
  }
}