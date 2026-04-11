import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage, HumanMessage, isAIMessage, ToolMessage } from '@langchain/core/messages'
import { JsonOutputToolsParser } from '@langchain/core/output_parsers/openai_tools'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'
import { Runnable, RunnableLambda } from '@langchain/core/runnables'
import { DynamicStructuredTool, Tool } from '@langchain/core/tools'
import { END } from '@langchain/langgraph/web'
import { AgentState, createCopilotAgentState } from './types'

export const SUPERVISOR_NAME = 'Supervisor'
export const TOOLS_NAME = 'tools'

export interface State extends AgentState {
  next: string
  instructions: string
  reasoning: string
  tool_call_id: string
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
    },
    tool_call_id: {
      value: (x: string, y?: string) => y,
      default: () => null
    }
  }
}

export const getInstructions = RunnableLambda.from((state: State) => {
  return {
    input: state.instructions,
    messages: [new HumanMessage(state.instructions)],
    role: state.role,
    context: state.context
  }
})

export const getMessages = RunnableLambda.from((state: State) => {
  return { messages: state.messages }
})

/**
 * Merge the messages of two graphs, and keep only the last message to the source graph
 */
export const joinGraph = RunnableLambda.from((response: AgentState) => {
  return {
    messages: [response.messages[response.messages.length - 1]]
  }
})

export const SupervisorSystemPrompt =
  'You are a supervisor tasked with managing a conversation between the' +
  ' following workers:  {team_members}. Given the following user request,' +
  ' respond with the worker to act next. Each worker will perform a' +
  ' task and respond with their results and status. When finished,' +
  ' respond with FINISH.\n\n' +
  ' Select strategically to minimize the number of steps taken.'

export const RouteFunctionName = 'route'
export function createRouteFunctionDef(members: string[]) {
  return {
    name: RouteFunctionName,
    description: 'Select the next role.',
    parameters: {
      title: 'routeSchema',
      type: 'object',
      properties: {
        reasoning: {
          title: 'Reasoning',
          type: 'string'
        },
        next: {
          title: 'Next',
          anyOf: [{ enum: members }]
        },
        instructions: {
          title: 'Instructions',
          type: 'string',
          description: 'The specific instructions of the sub-task the next role should accomplish.'
        }
      },
      required: ['reasoning', 'next', 'instructions']
    }
  }
}

export async function createSupervisor(
  llm: BaseChatModel,
  members: { name: string; description: string }[],
  systemPrompt?: string
): Promise<Runnable> {
  const options = ['FINISH', ...members.map(({ name }) => name)]
  const functionDef = createRouteFunctionDef(options)
  const toolDef = {
    type: 'function' as const,
    function: functionDef
  }
  let prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt ?? SupervisorSystemPrompt],
    new MessagesPlaceholder('messages'),
    ['system', 'Given the conversation above, who should act next? Or should we FINISH? Select one of: {options}']
  ])
  prompt = await prompt.partial({
    options: options.join(', '),
    team_members: members.map(({ name, description }) => `**${name}**: ${description}`).join('\n')
  })

  const supervisor = prompt
    .pipe(
      llm.bindTools([toolDef], {
        tool_choice: { type: 'function', function: { name: 'route' } }
      })
    )
    .pipe(new JsonOutputToolsParser<Tool>())
    // select the first one
    .pipe((x) => x[0].args)

  return supervisor
}

export async function createSupervisorAgent<S extends AgentState>(
  llm: BaseChatModel,
  members: { name: string; description: string }[],
  tools: DynamicStructuredTool[],
  system: string,
  suffix = ''
) {
  const functionDef = createRouteFunctionDef(members.map(({ name }) => name))
  const toolDef = {
    type: 'function' as const,
    function: functionDef
  }

  const modelWithTools = llm.bindTools([toolDef, ...(tools ?? [])])
  let prompt = ChatPromptTemplate.fromMessages([
    ['system', system],
    ['placeholder', '{messages}'],
    [
      'system',
      `Given the conversation above, please give priority to answering questions with language only. ${suffix}
To perform a task, you can select one of the following:
{members}`
    ]
  ])
  prompt = await prompt.partial({
    members: members.map(({ name, description }) => `- ${name}: ${description}`).join('\n')
  })
  const modelRunnable = prompt.pipe(modelWithTools)

  const callModel = async (state: S) => {
    // TODO: Auto-promote streaming.
    const _message = await modelRunnable.invoke(state)

    const newState = {
      messages: [_message as BaseMessage]
    } as State

    if (isAIMessage(_message)) {
      const message = _message as AIMessage
      if (message.tool_calls && message.tool_calls[0]?.name === RouteFunctionName) {
        newState.tool_call_id = message.tool_calls[0].id
        newState.next = message.tool_calls[0].args['next']
        newState.reasoning = message.tool_calls[0].args['reasoning']
        newState.instructions = message.tool_calls[0].args['instructions']
      }
    }

    return newState
  }

  return callModel
}

export const supervisorRouter = (state: AgentState) => {
  const { messages } = state
  const lastMessage = messages[messages.length - 1]
  if (isAIMessage(lastMessage)) {
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return END
    } else if (lastMessage.tool_calls[0]?.name === RouteFunctionName) {
      return lastMessage.tool_calls[0].args['next']
    } else {
      return TOOLS_NAME
    }
  } else {
    return END
  }
}

export function responseToolMessage(id: string, messages: BaseMessage[]) {
  return {
    tool_call_id: null,
    messages: [
      new ToolMessage({
        tool_call_id: id,
        content: messages[messages.length - 1]?.content
      })
    ]
  }
}
