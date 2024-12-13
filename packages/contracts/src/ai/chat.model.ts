import { MessageContent, MessageType } from '@langchain/core/messages'
import { ToolCall } from '@langchain/core/dist/messages/tool'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { JSONValue } from '../core.model'
import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from './xpert-agent-execution.model'
import { IXpert } from './xpert.model'
import { I18nObject } from '../types'

export type TChatConversationOptions = {
  knowledgebases?: string[]
  toolsets?: string[]
}

export type TChatConversationStatus = "idle" | "busy" | "interrupted" | "error"
export type TToolCallType = 'agent' | 'tool'

export type TSensitiveOperation = {
  messageId?: string
  toolCalls: {
    call: ToolCall
    type: TToolCallType
    info: {
      name: string
      title?: string
      description: string
    }
    parameters: {
      name: string;
      title: I18nObject | string
      type: string;
      description: I18nObject | string
      placeholder?: I18nObject | string
    }[]
  }[]
}

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
  /**
   * The last operation when interrupted
   */
  operation?: TSensitiveOperation

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
   */
  status?: XpertAgentExecutionStatusEnum | 'thinking' | 'aborted' | 'done'

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