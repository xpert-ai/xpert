import { BaseMessage } from '@langchain/core/messages'

export const CONTEXT_VARIABLE_CURRENTSTATE = 'currentState'

export type TMessageChannel = {
  messages: BaseMessage[]
  summary?: string
}
