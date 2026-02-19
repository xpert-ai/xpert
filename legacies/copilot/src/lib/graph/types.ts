import { BaseMessage } from '@langchain/core/messages'
import { StateGraphArgs } from '@langchain/langgraph/web'

export interface AgentState {
  input: string
  role: string
  context: string
  references?: string
  messages: BaseMessage[]
  language?: string
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
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => []
    },
    language: {
      value: (x: any, y: any) => y ?? x,
      default: () => ''
    }
  }
}
