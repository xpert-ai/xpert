import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpertAgentExecution } from './xpert-agent-execution.model'
import { IXpert } from './xpert.model'
import { I18nObject } from '../types'
import { CopilotChatMessage, CopilotMessageGroup, IChatMessage } from './chat-message.model'
import { IXpertAgent } from './xpert-agent.model'
import { IXpertProject } from './xpert-project.model'
import { IStorageFile } from '../storage-file.model'
import { IXpertTask } from './xpert-task.model'
import { TInterruptMessage, TToolCall } from '../agent'


export type TChatConversationOptions = {
  parameters?: {
    input?: string
    [key: string]: unknown
  }
  knowledgebases?: string[]
  toolsets?: string[]
  features?: Array<'timeline' | 'sandbox' | 'files'>
  workspacePath?: string
  workspaceUrl?: string
}

export type TChatConversationStatus = "idle" | "busy" | "interrupted" | "error"
export type TToolCallType = 'agent' | 'tool'
export type TChatFrom = 'platform' | 'webapp' | 'debugger' | 'knowledge' | 'job' | 'api' | 'feishu' | 'lark' | 'dingtalk' | 'wecom'

/**
 * Operation for interrupt
 */
export type TSensitiveOperation = {
  messageId?: string
  tasks?: {
    name: string;
    interrupts: {
      value?: TInterruptMessage;
      when?: "during";
      resumable?: boolean;
      ns?: string[];
    }[];
    type?: TToolCallType;
    info?: {
      name: string
      title?: string
      description: string
    }
    parameters?: {
      name: string;
      title: I18nObject | string
      type: string;
      description: I18nObject | string
      placeholder?: I18nObject | string
    }[],
    call?: TToolCall
    agent?: IXpertAgent
  }[]
}

/**
 * Chat conversation for xpert ai agent.
 * 
 * Corresponds to the thread in the [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export interface IChatConversation extends IBasePerTenantAndOrganizationEntityModel {
  /**
   * Thread id for agent execution
   */
  threadId: string
  /**
   * A short title summarizing the session
   */
  title?: string
  /**
   * Current status of conversation
   */
  status?: TChatConversationStatus
  /**
   * Options
   */
  options?: TChatConversationOptions
  /**
   * Error message when status is error
   */
  error?: string
  /**
   * ChatMessages in conversation
   */
  messages?: IChatMessage[] | null
  /**
   * The last operation when interrupted
   */
  operation?: TSensitiveOperation
  /**
   * Conversation source / user type
   */
  from: TChatFrom
  /**
   * End anonymous user
   */
  fromEndUserId?: string

  // Many to one
  /**
   * Chat with Xpert
   */
  xpert?: IXpert
  xpertId?: string | null

  project?: IXpertProject
  projectId?: string | null

  task?: IXpertTask
  taskId?: string | null

  // One to Many
  executions?: IXpertAgentExecution[]
  /**
   * Files
   */
  attachments?: IStorageFile[]
}

export type TChatConversationLog = IChatConversation & {
  messageCount: number
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

/**
 * @deprecated use ChatMessageEventTypeEnum
 */
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


/**
 * @deprecated use ChatMessageEventTypeEnum
 */
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
