import { StoredMessage } from '@langchain/core/messages'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpert } from './xpert.model'
import { IXpertAgent } from './xpert-agent.model'
import { TSensitiveOperation } from './chat.model'

/**
 * Corresponds to the run in the [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export type TXpertAgentExecution = {
  title?: string
  processData?: any
  inputs?: any
  outputs?: any
  status?: XpertAgentExecutionStatusEnum
  error?: string
  elapsedTime?: number
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

  // State of graph
  threadId?: string
  checkpointNs?: string
  checkpointId?: string
  parent_thread_id?: string
  /**
   * Latest operation when interrupted
   */
  operation?: TSensitiveOperation

  // Many to one
  agentKey?: string
  xpert?: IXpert
  xpertId?: string
  // Parent AgentExecution
  parentId?: string

  // Temporary properties
  // From CopilotCheckpoint
  messages?: StoredMessage[]
  agent?: IXpertAgent
  totalTokens?: number
}

/**
 * Execute xpert agent.
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