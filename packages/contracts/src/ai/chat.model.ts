import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpertAgentExecution } from './xpert-agent-execution.model'
import { IXpert } from './xpert.model'
import { I18nObject } from '../types'
import { CopilotChatMessage, CopilotMessageGroup, IChatMessage } from './chat-message.model'
import { IXpertAgent } from './xpert-agent.model'
import { IXpertProject } from './xpert-project.model'
import { IStorageFile } from '../storage-file.model'
import { IXpertTask } from './xpert-task.model'
import { TToolCall } from '../agent'
import { TInterrupt } from '../agent/interrupt'
import { IUser } from '../user.model'
import type { RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'

export type TChatConversationOptions = {
  /** Persisted resources augment the entry Agent without changing the Assistant graph. */
  runtimeResources?: import('../agent-plugin').RuntimeResourcesSelection
  parameters?: {
    input?: string
    [key: string]: unknown
  }
  knowledgebases?: string[]
  toolsets?: string[]
  features?: Array<'timeline' | 'sandbox' | 'files'>
  workspacePath?: string
  workspaceUrl?: string
  workspaceRoot?: string
  sharedWorkspacePath?: string
  agentWorkspacePath?: string
  sessionWorkspacePath?: string
  memoryWorkspacePath?: string
  sandboxEnvironmentId?: string
  runtimeCapabilities?: RuntimeCapabilitiesSelection
}

export type TChatConversationSourceAudit = {
  sourceIntegrationId?: string | null
  channelType?: string | null
  sourceMessageLogIds?: string[]
}

export type TChatConversationStatus = 'idle' | 'busy' | 'pausing' | 'paused' | 'interrupted' | 'error'

export type TChatCheckpointReference = { threadId: string; checkpointNs: string; checkpointId: string }

export type TChatInputCheckpoint = {
  version: 1
  checkpoint: TChatCheckpointReference | null
  graphRevision: string
}

/**
 * Server-only graph boundary for an assistant reply. Capture first pins persisted
 * state; both hashes are added only after the final message and its path are saved.
 * An unsealed boundary must never enable branching in public message payloads.
 */
export type TChatOutputCheckpoint = {
  version: 1
  /** Exact root-graph resume point; never substitute the thread's latest checkpoint. */
  checkpoint: TChatCheckpointReference
  /** Root and child namespaces pinned while this execution still owns the thread. */
  checkpoints: TChatCheckpointReference[]
  /** Reject continuation if the published graph no longer matches this boundary. */
  graphRevision: string
  options?: TChatConversationOptions
  /** Hash of the finalized presentation; detects later edits to stored messages. */
  messageHash?: string
  /** Hash of the ordered ancestor path, including the selected assistant reply. */
  messagePathHash?: string
  /** Access must be checked again before linking these assets to a new conversation. */
  fileAssetIds?: string[]
  agentRuns?: import('./xpert-agent-execution.model').TChatAgentRunSummary[]
}

/** Copy the source thread's ancestor path through afterMessageId, inclusive. */
export type TConversationBranchRequest = {
  sourceThreadId: string
  afterMessageId: string
  /** Reuse this UUID for retries of one user attempt; changing parameters is a conflict. */
  requestId: string
}

/** Audit data and retry identity, not foreign keys into the source conversation. */
export type TConversationBranchSource = {
  conversationId: string
  threadId: string
  messageId: string
  requestId: string
  naming?: TConversationBranchNaming
}

/** Persisted numbering group; display titles are never parsed to infer ancestry. */
export type TConversationBranchNaming = {
  /** Stable numbering group retained even if its original conversation is deleted. */
  familyId: string
  baseTitle: string
  /** The original is implicitly 1; generated branches start at 2. */
  number: number
  /** A different current title means the user renamed the branch and starts a new group. */
  generatedTitle: string
}

/** Public capability reasons shared by history reads and message completion events. */
export type TChatMessageBranchUnavailableReason =
  | 'message_not_complete'
  | 'checkpoint_unavailable'
  | 'graph_changed'
  | 'state_not_supported'

/** UI hint only; the branch endpoint revalidates access, state and graph compatibility. */
export type TChatMessageBranching = {
  available: boolean
  reason?: TChatMessageBranchUnavailableReason
}

// Versioned client presentation state; never an execution checkpoint or model input.
export type TChatThreadDisplayPause = {
  executionId: string
  pauseId: string
  createdAt: string
  snapshot?: string
}

export type TChatThreadRunControl = {
  executionId: string
  state: 'running' | 'pausing' | 'paused'
  pauseId?: string
  graphRevision?: string
  checkpoint?: TChatCheckpointReference
}

/** Why a derived conversation thread was created. */
export const ChatThreadPurpose = {
  SideChat: 'side-chat',
  MessageEdit: 'message-edit'
} as const
export type TChatThreadPurpose = (typeof ChatThreadPurpose)[keyof typeof ChatThreadPurpose]

/** Machine-readable keys stored in `ChatConversationThread.metadata`. */
export type TChatThreadMetadata = {
  primary?: boolean
  purpose?: TChatThreadPurpose
  /** Graph revision the edited input was captured on; cleared after the first successful run. */
  forkGraphRevision?: string
  /** Client-provided idempotency key for branch creation. */
  forkRequestId?: string
  [key: string]: unknown
}
export type TToolCallType = 'agent' | 'tool'
export type TChatFrom =
  | 'platform'
  | 'webapp'
  | 'debugger'
  | 'knowledge'
  | 'job'
  | 'schedule'
  | 'api'
  | 'feishu'
  | 'lark'
  | 'dingtalk'
  | 'wecom'
  | 'wechat'

/**
 * Operation for interrupt
 */
export type TSensitiveOperation = {
  messageId?: string
  tasks?: {
    name: string
    interrupts: TInterrupt[]
    type?: TToolCallType
    info?: {
      name: string
      title?: string
      description: string
    }
    parameters?: {
      name: string
      title: I18nObject | string
      type: string
      description: I18nObject | string
      placeholder?: I18nObject | string
    }[]
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
  branchSource?: TConversationBranchSource | null
  /**
   * Non-persistent, response-only field populated by the sidebar endpoint.
   * Not stored on the ChatConversation entity or in the chat_conversation table.
   * Values are persisted separately in the current user's Assistant preferences
   * under preferences.conversationSidebar[conversationId].
   *
   * @transient
   */
  sidebar?: TChatConversationSidebarState
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
   * Stable source audit information for background/channel-triggered conversations.
   */
  sourceAudit?: TChatConversationSourceAudit | null
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
  /**
   * Internal user matched by fromEndUserId when available
   */
  fromEndUser?: IUser

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
   * @deprecated Conversation-level chat attachments are superseded by
   * per-message `fileAssets` and `ConversationFileLink`.
   */
  attachments?: IStorageFile[]
}

export type TChatConversationSidebarState = {
  pinned: boolean
  archived: boolean
}

export type TChatConversationLog = IChatConversation & {
  messageCount: number
  sourceIntegrationId?: string | null
  channelType?: string | null
  sourceMessageLogIds?: string[]
}

export interface IChatConversationReadState extends IBasePerTenantAndOrganizationEntityModel {
  conversationId: string
  userId: string
  lastReadAt: Date | string
  lastReadMessageId?: string | null
}

export interface IChatConversationMarkReadRequest {
  lastReadMessageId?: string | null
}

export interface IChatConversationUnreadXpertsRequest {
  xpertIds: string[]
}

export interface IChatConversationUnreadXpertSummary {
  xpertId: string
  unreadMessages: number
  unreadConversations: number
  latestUnreadAt?: Date | string | null
  latestUnreadConversationId?: string | null
  latestUnreadThreadId?: string | null
  latestConversationAt?: Date | string | null
  latestConversationId?: string | null
  latestConversationThreadId?: string | null
  latestConversationTitle?: string | null
}

// Types
export type ChatMessage = {
  conversationId: string
  id: string
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
  organizationId?: string
  xpert?: {
    id: string
    knowledgebases?: string[]
    toolsets: string[] | null
  }
} & (
  | {
      event: ChatGatewayEvent.CancelChain
      data: {
        conversationId: string // Conversation ID
      }
    }
  | {
      event: ChatGatewayEvent.ChainAborted
      data: {
        conversationId: string // Conversation ID
        id?: string // Message id
      }
    }
  | {
      event: ChatGatewayEvent.ConversationCreated
      data: IChatConversation
    }
  | {
      event: ChatGatewayEvent.MessageStream
      data: ChatUserMessage
    }
  | {
      event: ChatGatewayEvent.ToolStart | ChatGatewayEvent.ToolEnd
      data: CopilotMessageGroup | CopilotMessageGroup[]
    }
  | {
      event: ChatGatewayEvent.ChainStart | ChatGatewayEvent.ChainEnd
      data: {
        id: string
      }
    }
  | {
      event: ChatGatewayEvent.StepStart | ChatGatewayEvent.StepEnd
      data: CopilotChatMessage
    }
  | {
      event: ChatGatewayEvent.Message | ChatGatewayEvent.Error
      data: CopilotChatMessage
    }
  | {
      event: ChatGatewayEvent.Agent
      data: {
        id: string
        message: CopilotChatMessage
      }
    }
)
