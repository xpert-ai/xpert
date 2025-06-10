import { StoredMessage } from '@langchain/core/messages'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpert, TXpertTeamNodeType } from './xpert.model'
import { IXpertAgent } from './xpert-agent.model'
import { TSensitiveOperation } from './chat.model'
import { I18nObject } from '../types'
import { WorkflowNodeTypeEnum } from './xpert-workflow.model'

export type TXpertExecution = {
  category?: TXpertTeamNodeType
  type?: WorkflowNodeTypeEnum | string
  title?: string | I18nObject
  inputs?: any
  outputs?: any
  status?: XpertAgentExecutionStatusEnum
  error?: string
  elapsedTime?: number

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
  // Token usage
  totalPrice?: number
  currency?: string
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
  /**
   * AI model provider
   */
  provider: string
  /**
   * AI Model
   */
  model: string
}