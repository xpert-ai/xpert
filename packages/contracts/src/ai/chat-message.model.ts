import { MessageContent, MessageContentImageUrl, MessageType } from '@langchain/core/messages';
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IChatConversation } from './chat.model'
import { LongTermMemoryTypeEnum } from './xpert.model'
import { XpertAgentExecutionStatusEnum } from './xpert-agent-execution.model';
import { JSONValue } from '../core.model';

export type TSummaryJob = Record<LongTermMemoryTypeEnum, {
    jobId: number | string;
    status: string
    progress?: number
    memoryKey?: string
  }>

export enum ChatMessageStepType {
  File = 'file',
  ComputerUse = 'computer_use',
}

export enum ChatMessageStepCategory {
  /**
   * Websearch results
   */
  WebSearch = 'web_search',
  /**
   * Files creation view or edition
   */
  Files = 'files',
  /**
   * Program Execution
   */
  Program = 'program'
}

export type TChatMessageStep = {
  type?: ChatMessageStepType
  category?: ChatMessageStepCategory
  toolset?: string
  tool?: string
  title?: string
  message?: string
  created_date?: Date | string
  data?: any
}

/**
 * 
 */
export interface IChatMessage extends IBasePerTenantAndOrganizationEntityModel, Omit<Omit<CopilotBaseMessage, 'createdAt'>, 'id'> {

  summaryJob?: TSummaryJob

  /**
   * the third-party platform's message
   */
  thirdPartyMessage?: any

  steps?: TChatMessageStep[]

  // Many to one
  /**
   * Chat conversation
   */
  conversation?: IChatConversation
  conversationId?: string | null

  executionId?: string
}


/**
 * @deprecated
 */
export type DeprecatedMessageType = 'assistant' | 'user' | 'info' | 'component'
export type CopilotMessageType = MessageType | DeprecatedMessageType

export type ChatMessageStatusEnum = XpertAgentExecutionStatusEnum | 'thinking' | 'reasoning' | 'answering' | 'aborted'

/**
 * BaseMessage or AIMessage in Langchain.js
 */
export interface CopilotBaseMessage {
  id: string
  createdAt?: Date
  role: CopilotMessageType
  
  /**
   * Status of the message:
   */
  status?: ChatMessageStatusEnum

  content?: string | TMessageContent
  reasoning?: MessageContent

  /**
   * Error info when status is error
   */
  error?: string
}

export type CopilotChatMessage = CopilotBaseMessage & {

  tool_call_id?: string
  
  /**
   * If the message has a role of `function`, the `name` field is the name of the function.
   * Otherwise, the name field should not be set.
   */
  name?: string

  data?: JSONValue

  messages?: Array<any> // StoredMessage

  executionId?: string
}

/**
 * @deprecated use data attr in message (subMessages)
 */
export interface CopilotMessageGroup extends CopilotBaseMessage {
  messages?: CopilotChatMessage[]
}

/**
 * Similar to {@link MessageContentText} | {@link MessageContentImageUrl}, which together form {@link MessageContentComplex}
 */
export type TMessageContentComponent = {
  id: string
  type: 'component'
  data: TMessageComponent
}

/**
 * Defines the data type of the sub-message of `component` type in the message `content` {@link MessageContentComplex}
 */
export type TMessageComponent<T extends object = object> = T & {
  category: 'Dashboard' | 'Computer'
  type: string
}

export type TMessageContentText = {
  id?: string
  agentKey?: string
  type: "text";
  text: string;
};
/**
 * Enhance {@link MessageContentComplex} in Langchain.js
 */
export type TMessageContentComplex = (TMessageContentText | MessageContentImageUrl | TMessageContentComponent | (Record<string, any> & {
  type?: "text" | "image_url" | string;
}) | (Record<string, any> & {
  type?: never;
})) & {agentKey?: string}
/**
 * Enhance {@link MessageContent} in Langchain.js
 */
export type TMessageContent = string | TMessageContentComplex[];

// Type guards
/**
 * @deprecated use content in message
 */
export function isMessageGroup(message: CopilotBaseMessage): message is CopilotMessageGroup {
  return 'messages' in message;
}