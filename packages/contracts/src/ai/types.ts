import { BaseMessage } from '@langchain/core/messages'

export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'
export const STATE_VARIABLE_SYS = 'sys'
export const GRAPH_NODE_SUMMARIZE_CONVERSATION = 'summarize_conversation'
export const GRAPH_NODE_TITLE_CONVERSATION = 'title_conversation'

export type TMessageChannel = {
  messages: BaseMessage[]
  summary?: string
}


export type TErrorHandling = {
  type?: null | 'defaultValue' | 'failBranch'
  defaultValue?: {content?: string}
  failBranch?: string
}