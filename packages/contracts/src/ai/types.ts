import { BaseMessage } from '@langchain/core/messages'
import { Subscriber } from 'rxjs'

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

export type TAgentRunnableConfigurable = {
  thread_id: string
  checkpoint_ns: string
  // Custom configurable of invoke
  tenantId: string
  organizationId: string
  language: string
  userId: string
  // Caller
  agentKey: string
  subscriber: Subscriber<any>
}