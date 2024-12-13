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
  tokens?: number
  metadata?: TAgentExecutionMetadata

  threadId?: string
  parent_thread_id?: string
  operation?: TSensitiveOperation

  // Many to one
  agentKey?: string
  xpert?: IXpert
  xpertId?: string
  // Parent AgentExecution
  parentId?: string

  subExecutions?: IXpertAgentExecution[]

  // Temporary properties
  // From CopilotCheckpoint
  messages?: StoredMessage[]
  runningExecution?: IXpertAgentExecution
  agent?: IXpertAgent
  totalTokens?: number
}

/**
 * Execute xpert agent.
 * 
 * Corresponds to the run in the [Agent Protocol](https://github.com/langchain-ai/agent-protocol).
 */
export interface IXpertAgentExecution extends IBasePerTenantAndOrganizationEntityModel, TXpertAgentExecution {
  
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