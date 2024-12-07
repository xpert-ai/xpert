import { MessageContent, MessageType } from '@langchain/core/messages'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { JSONValue } from '../core.model'
import { IXpertAgentExecution } from './xpert-agent-execution.model'
import { IXpert } from './xpert.model'

export type TChatConversationOptions = {
  knowledgebases?: string[]
  toolsets?: string[]
}

export type TChatConversationStatus = "idle" | "busy" | "interrupted" | "error"

/**
 * Chat conversation for xpert ai agent.
 * 
 * Corresponds to the thread in the [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export interface IChatConversation extends IBasePerTenantAndOrganizationEntityModel {
  threadId: string
  title?: string
  status?: TChatConversationStatus
  
  options?: TChatConversationOptions

  messages?: CopilotBaseMessage[] | null

  // // One ton one
  // /**
  //  * @deprecated should has multiple executions for every run
  //  */
  // execution?: IXpertAgentExecution
  // /**
  //  * @deprecated should has multiple executions for every run
  //  */
  // readonly executionId?: string

  // Many to one
  /**
   * Chat with Xpert
   */
  xpert?: IXpert
  xpertId?: string | null

  executions?: IXpertAgentExecution[]
}

// Types
export type ChatMessage = {
  conversationId: string;
  id: string;
  content: string
}

export type ChatUserMessage = ChatMessage & {
  language: string
}

export enum ChatGatewayEvent {
  ACK = 'ack', // acknowledgment for received message
  ConversationCreated = 'conversation_created',
  Message = 'message',
  MessageStream = 'message_stream',
  StepStart = 'step_start',
  StepEnd = 'step_end',
  ToolStart = 'tool_start',
  ToolEnd = 'tool_end',
  ChainStart = 'chain_start',
  ChainEnd = 'chain_end',
  CancelChain = 'cancel_chain',
  ChainAborted = 'chain_aborted',
  Error = 'error',
  Agent = 'agent'
}

export type ChatGatewayMessage = {
  organizationId?: string;
  xpert?: {
    id: string
		knowledgebases?: string[]
    toolsets: string[] | null
  }
} & ({
  event: ChatGatewayEvent.CancelChain
  data: {
    conversationId: string // Conversation ID
  }
} | {
  event: ChatGatewayEvent.ChainAborted
  data: {
    conversationId: string // Conversation ID
    id?: string // Message id
  }
} | {
  event: ChatGatewayEvent.ConversationCreated
  data: IChatConversation
} | {
  event: ChatGatewayEvent.MessageStream
  data: ChatUserMessage
} | {
  event: ChatGatewayEvent.ToolStart | ChatGatewayEvent.ToolEnd
  data: CopilotMessageGroup | CopilotMessageGroup[]
} | {
  event: ChatGatewayEvent.ChainStart | ChatGatewayEvent.ChainEnd
  data: {
    id: string
  }
} | {
  event: ChatGatewayEvent.StepStart | ChatGatewayEvent.StepEnd
  data: CopilotChatMessage
} | {
  event: ChatGatewayEvent.Message | ChatGatewayEvent.Error
  data: CopilotChatMessage
} | {
  event: ChatGatewayEvent.Agent
  data: {
    id: string
    message: CopilotChatMessage
  }
})

/**
 * @deprecated
 */
export type DeprecatedMessageType = 'assistant' | 'user' | 'info' | 'component'
export type CopilotMessageType = MessageType | DeprecatedMessageType
/**
 * 
 */
export interface CopilotBaseMessage {
  id: string
  createdAt?: Date
  role: CopilotMessageType
  
  /**
   * Status of the message:
   * - thinking: AI is thinking
   * - answering: AI is answering
   * - pending: AI is pending for confirm or more information
   * - done: AI is done
   * - aborted: AI is aborted
   * - error: AI has error
   */
  status?: 'thinking' | 'answering' | 'pending' | 'done' | 'aborted' | 'error'

  content?: string | MessageContent
}

export type CopilotChatMessage = CopilotBaseMessage & {

  tool_call_id?: string
  
  /**
   * If the message has a role of `function`, the `name` field is the name of the function.
   * Otherwise, the name field should not be set.
   */
  name?: string

  data?: JSONValue

  error?: string

  messages?: Array<any> // StoredMessage

  executionId?: string
}

export interface CopilotMessageGroup extends CopilotBaseMessage {
  messages?: CopilotChatMessage[]
}

// Type guards
export function isMessageGroup(message: CopilotBaseMessage): message is CopilotMessageGroup {
  return 'messages' in message;
}