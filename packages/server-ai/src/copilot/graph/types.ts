import { ToolCall } from '@langchain/core/dist/messages/tool'
import { BaseMessage } from '@langchain/core/messages'
import { messagesStateReducer, StateGraphArgs } from '@langchain/langgraph'

export interface AgentState {
  input: string
  role: string
  context: string
  references?: string
  messages: BaseMessage[]
  language?: string
  toolCall?: ToolCall
}

export function createCopilotAgentState(): StateGraphArgs<AgentState>['channels'] {
  return {
    input: {
      value: (x: any, y: any) => y ?? x,
      default: () => ''
    },
    role: {
      value: (x: any, y: any) => y ?? x,
      default: () => ''
    },
    context: {
      value: (x: any, y: any) => y ?? x,
      default: () => ''
    },
    references: {
      value: (x: any, y: any) => y ?? x,
      default: () => ''
    },
    messages: {
      value: messagesStateReducer,
      default: () => []
    },
    language: {
      value: (x: any, y: any) => y ?? x,
      default: () => ''
    }
  }
}
