import { BaseMessage } from '@langchain/core/messages'

export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'
export const STATE_VARIABLE_SYS = 'sys'

export type TMessageChannel = {
  messages: BaseMessage[]
  summary?: string
}
