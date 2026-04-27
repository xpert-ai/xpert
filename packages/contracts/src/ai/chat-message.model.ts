import { MessageType } from '@langchain/core/messages'
import type { TChatMessageStep, TMessageContent, TMessageContentReasoning } from '@xpert-ai/chatkit-types'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IChatConversation } from './chat.model'
import { LongTermMemoryTypeEnum } from './xpert.model'
import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from './xpert-agent-execution.model'
import { JSONValue } from '../core.model'
import { IStorageFile } from '../storage-file.model'
import { TAcpRuntimePhase } from './acp-session.model'

export type TSummaryJob = Record<
  LongTermMemoryTypeEnum,
  {
    jobId: number | string
    status: string
    progress?: number
    memoryKey?: string
  }
>

/**
 * @deprecated Temporary duplicate of `ChatKitReferenceBase` from `@xpert-ai/chatkit-types`.
 * Use the shared chatkit type once that package release is available to contracts.
 */
export type TChatReferenceBase = {
  id?: string
  label?: string
  text: string
}

/**
 * @deprecated Temporary duplicate of `ChatKitCodeReference` from `@xpert-ai/chatkit-types`.
 * Use the shared chatkit type once that package release is available to contracts.
 */
export type TChatCodeReference = TChatReferenceBase & {
  type: 'code'
  path: string
  startLine: number
  endLine: number
  language?: string
  taskId?: string
}

/**
 * @deprecated Temporary duplicate of `ChatKitQuoteReference` from `@xpert-ai/chatkit-types`.
 * Use the shared chatkit type once that package release is available to contracts.
 */
export type TChatQuoteReference = TChatReferenceBase & {
  type: 'quote'
  messageId?: string
  source?: string
}

/**
 * @deprecated Temporary duplicate of `ChatKitImageReference` from `@xpert-ai/chatkit-types`.
 * Use the shared chatkit type once that package release is available to contracts.
 */
export type TChatImageReference = TChatReferenceBase & {
  type: 'image'
  fileId?: string
  url?: string
  mimeType?: string
  name?: string
  size?: number
  width?: number
  height?: number
}

export type TChatElementAttribute = {
  name: string
  value: string
}

export type TChatElementReferenceFields = {
  attributes: TChatElementAttribute[]
  outerHtml: string
  pageTitle?: string
  pageUrl: string
  role?: string
  selector: string
  serviceId: string
  tagName: string
}

export type TChatElementReferenceCandidateFields = {
  [Property in keyof TChatElementReferenceFields]?: unknown
}

export type TChatElementReference = TChatReferenceBase &
  TChatElementReferenceFields & {
    type: 'element'
  }

export type TChatReference = TChatCodeReference | TChatQuoteReference | TChatImageReference | TChatElementReference

export type TAcpSystemEventMessage = {
  type: 'acp_system_event'
  source: 'codexpert'
  origin: 'system'
  acpSessionId: string
  executionId?: string | null
  phase?: TAcpRuntimePhase | null
  headline: string
  sequence?: number
  sequenceRange?: [number, number]
  toolName?: string | null
  toolStatus?: string | null
  requiresAttention?: boolean
  final?: boolean
  liveText?: boolean
  truncated?: boolean
}

/**
 * Chat message entity type
 */
export interface IChatMessage
  extends IBasePerTenantAndOrganizationEntityModel, Omit<Omit<CopilotBaseMessage, 'createdAt'>, 'id'> {
  parent?: IChatMessage | null
  children?: IChatMessage[]
  parentId?: string | null

  /**
   * Files
   */
  attachments?: IStorageFile[]
  /**
   * Structured references associated with the human input
   */
  references?: TChatReference[]
  /**
   * Job of summary
   */
  summaryJob?: TSummaryJob

  /**
   * the third-party platform's message
   */
  thirdPartyMessage?: any

  /**
   * Step messages from tools or others
   */
  events?: TChatMessageStep[]

  // Many to one
  /**
   * Chat conversation
   */
  conversation?: IChatConversation
  conversationId?: string | null

  executionId?: string
  execution?: IXpertAgentExecution
  followUpMode?: 'queue' | 'steer'
  followUpStatus?: 'pending' | 'consumed' | 'canceled'
  targetExecutionId?: string | null
  visibleAt?: Date | string | null
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
  id?: string
  createdAt?: Date
  role: CopilotMessageType

  /**
   * Status of the message:
   */
  status?: ChatMessageStatusEnum

  content?: string | TMessageContent

  /**
   * Reasoning step messages
   */
  reasoning?: TMessageContentReasoning[]

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

// Type guards
/**
 * @deprecated use content in message
 */
export function isMessageGroup(message: CopilotBaseMessage): message is CopilotMessageGroup {
  return 'messages' in message
}
