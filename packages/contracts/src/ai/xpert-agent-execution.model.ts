import { StoredMessage } from '@langchain/core/messages'
import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpert } from './xpert.model'
import { IXpertAgent } from './xpert-agent.model'

export type TXpertAgentExecution = {
  title?: string
  processData?: any
  inputs?: any
  outputs?: any
  status?: XpertAgentExecutionEnum
  error?: string
  elapsedTime?: number
  tokens?: number
  metadata?: TAgentExecutionMetadata

  thread_id?: string
  parent_thread_id?: string

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
 * Execute xpert agent
 */
export interface IXpertAgentExecution extends IBasePerTenantAndOrganizationEntityModel, TXpertAgentExecution {
  
}

export enum XpertAgentExecutionEnum {
  RUNNING = 'running',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed'
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