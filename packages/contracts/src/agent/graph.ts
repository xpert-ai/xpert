import { BaseMessage } from '@langchain/core/messages'
import { Subscriber } from 'rxjs'
import { TMessageContentComplex } from '../ai/chat-message.model'

export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'
export const STATE_VARIABLE_SYS = 'sys'
export const GRAPH_NODE_SUMMARIZE_CONVERSATION = 'summarize_conversation'
export const GRAPH_NODE_TITLE_CONVERSATION = 'title_conversation'
export const STATE_VARIABLE_FILES = 'files'

export type TMessageChannel = {
  messages: BaseMessage[]
  summary?: string
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

  signal?: AbortSignal
}


// Helpers
export function messageContentText(content: string | TMessageContentComplex) {
	return typeof content === 'string' ? content : content.type === 'text' ? content.text : ''
}
