import { StoredMessage } from '@langchain/core/messages'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpert, TXpertTeamNodeType } from './xpert.model'
import { IXpertAgent } from './xpert-agent.model'
import { TSensitiveOperation } from './chat.model'
import { WorkflowNodeTypeEnum } from './xpert-workflow.model'
import type { IModelUsageDetails } from './model-usage.model'
import type { TAvatar } from '../types'

export type TXpertExecution = {
  category?: TXpertTeamNodeType
  type?: WorkflowNodeTypeEnum | string
  title?: string
  inputs?: any
  outputs?: any
  status?: XpertAgentExecutionStatusEnum
  error?: string
  elapsedTime?: number
  /** Wall-clock end of the current execution attempt; cleared when execution resumes. */
  completedAt?: Date | null

  // State of graph
  threadId?: string
  checkpointNs?: string
  checkpointId?: string
  channelName?: string
  parent_thread_id?: string

  // Many to one
  /**
   * Include workflow node key
   */
  agentKey?: string
  predecessor?: string
  xpert?: IXpert
  xpertId?: string
  // Parent AgentExecution
  parentId?: string
}

export type TXpertAgentExecutionCheckpoint = {
  threadId: string
  checkpointNs: string
  checkpointId: string
  parentCheckpointId?: string | null
  createdAt?: string | null
  metadata?: Record<string, unknown> | null
  isCurrent?: boolean
}

/** Priced model usage for one execution, in each provider's reported currency. */
export type ExecutionUsageSummary = {
  costs: Array<{ currency: string; amount: number; tokens: number }>
  /** Most recent positive prompt measurement for the context-window indicator. */
  lastInputTokens: number
}

/**
 * Corresponds to the run in the [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export type TXpertAgentExecution = TXpertExecution & {
  /**
   * Total token usage of chat model
   */
  tokens?: number
  /**
   * Token usage of embedding
   */
  embedTokens?: number
  metadata?: TAgentExecutionMetadata

  /**
   * Latency of response from provider (s)
   */
  responseLatency?: number
  /** Posted point debits for this execution alone. Absent until a linked debit is recorded. */
  chargedPoints?: number | null
  // Token usage
  usageSummary?: ExecutionUsageSummary | null
  /** Available when the priced calls have a single currency. */
  totalPrice?: number | null
  currency?: string | null
  inputTokens?: number
  inputUnitPrice?: number
  inputPriceUnit?: number
  outputTokens?: number
  outputUnitPrice?: number
  outputPriceUnit?: number

  /**
   * Latest operation when interrupted
   */
  operation?: TSensitiveOperation

  // Stored messages or from checkpoints
  messages?: StoredMessage[]

  // Temporary properties
  agent?: IXpertAgent
  totalTokens?: number
  modelUsages?: IModelUsageDetails[]
  /**
   * Summary of conversation
   */
  summary?: string
}

/**
 * Execution of agent or workflow nodes.
 *
 * Corresponds to the run in the [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export interface IXpertAgentExecution extends IBasePerTenantAndOrganizationEntityModel, TXpertAgentExecution {
  subExecutions?: IXpertAgentExecution[]

  // Temporary properties
  runningExecution?: IXpertAgentExecution
}

/**
 * Corresponds to the status of Run in [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export enum XpertAgentExecutionStatusEnum {
  RUNNING = 'running',
  SUCCESS = 'success',
  ERROR = 'error',
  PENDING = 'pending',
  TIMEOUT = 'timeout',
  INTERRUPTED = 'interrupted'
}

export type TAgentExecutionMetadata = {
  /** Host-created result continuation; its inbox claim proves the originating execution. */
  runtimeContinuation?: {
    /** Durable runtime inbox entry whose claim identifies this continuation and its source invocation. */
    inboxId: string
  }
  /** Written atomically with root checkpoints, not by message/execution finalizers. */
  recovery?: import('./chat-recovery.model').TChatExecutionRecovery
  /** Agent-plugin template provenance retained for the Assistant used by this execution. */
  templateSource?: import('../agent-plugin').TemplateAgentSource
  /** Reported business outcome, separate from process completion and the execution status. */
  businessOutcome?: import('@xpert-ai/chatkit-types').TAgentExecutionOutcome
  /** Recorded by the invocation boundary; never inferred from agent names. */
  invocationKind?: 'external_assistant' | 'sub_agent'
  /** Tool call in the parent execution that started this run. Omit for workflow-driven runs. */
  sourceToolCallId?: string
  /** Assistant display name captured for execution history and live presentation. */
  assistantName?: string
  /** Assistant avatar captured with the display name; not an identity or authorization source. */
  assistantAvatar?: TAvatar
  /**
   * AI model provider
   */
  provider?: string
  /**
   * AI Model
   */
  model?: string
  /** Opaque Assistant model option used by the base and Primary models. */
  primaryModelId?: string
  /** Whether model selection came from an explicit choice, preference, default, retry or fallback. */
  primaryModelSource?: import('./assistant-model.model').TAssistantPrimaryModelSelectionSource
  /** Sanitized model snapshot used to keep resume and retry deterministic. */
  primaryModelSnapshot?: Pick<
    import('./copilot-model.model').TCopilotModel,
    'copilotId' | 'modelType' | 'model' | 'options'
  >
  /** Audited entry-point category, with adapter-specific values retained for compatibility. */
  triggerSource?: 'integration' | 'channel' | 'api' | 'job' | 'trigger' | string
  /** Originating integration resolved from the source audit or trusted runtime principal. */
  sourceIntegrationId?: string
  /** Integration supplied by the caller; defaults to sourceIntegrationId when absent. */
  integrationId?: string
  /** Source channel type recorded by the channel adapter. */
  channelType?: string
  /** Adapter-specific channel ingress label, normalized from channelSource or channel_source. */
  channelSource?: string
  /** Original caller-supplied entry-point label, retained alongside normalized triggerSource. */
  from?: string
  /** End-user identifier in the originating client or channel, not a platform user grant. */
  fromEndUserId?: string
  /** User identifier supplied by the channel adapter. */
  channelUserId?: string
  /** Opaque UUID forwarded by a source adapter; not the platform execution ID. */
  uuid?: string
  /** WeChat account owner identifier forwarded by a compatible channel adapter. */
  ownerWxid?: string
  /** Source-channel contact identifier, normalized from contactId or contact_id. */
  contactId?: string
  /** Source-channel conversation identifier, normalized from chatId or chat_id. */
  chatId?: string
  /** Source-channel conversation type, normalized from chatType or chat_type. */
  chatType?: string
  /** Source-channel message sender identifier, normalized from senderId or sender_id. */
  senderId?: string
  /** Deduplicated inbound message-log identifiers used to trace this execution's source. */
  sourceMessageLogIds?: string[]
  /** Handoff message that dispatched this execution. */
  handoffMessageId?: string
  /** Trace identifier correlating related handoff messages and executions. */
  handoffTraceId?: string
  /** Parent handoff message identifier for the dispatch chain. */
  handoffParentMessageId?: string
  /** Runtime principal type captured for audit; does not itself grant permission. */
  runtimePrincipalType?: string
  /** Assistant identity from the trusted runtime principal, retained for source auditing. */
  runtimePrincipalXpertId?: string
  /** Root execution this run continued after a durable thread pause. */
  resumedFromExecutionId?: string
  /** Host-validated root execution whose original input was retried in this new run. */
  retriedFromExecutionId?: string
  /** Extension metadata; consumers must validate unknown values before using them. */
  [key: string]: unknown
}

/** Public execution summary shared by live events and conversation history. */
export type TChatAgentRunSummary = {
  businessOutcome?: import('@xpert-ai/chatkit-types').TAgentExecutionOutcome
  /** Identifies the main reply and its total duration without inferring identity from agent names. */
  isRoot?: boolean
  id: string
  parentId?: string
  type?: string
  category?: TXpertTeamNodeType
  agentKey?: string
  xpertId?: string
  xpertName?: string
  avatar?: TAvatar
  title?: string
  invocationKind?: TAgentExecutionMetadata['invocationKind']
  /** Matches the Tool component id within parentId; never match by tool name or provider. */
  sourceToolCallId?: TAgentExecutionMetadata['sourceToolCallId']
  model?: string
  status?: string
  elapsedTime?: number
  inputs?: unknown
  error?: string
  createdAt?: string
  updatedAt?: string
}
