import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IXpertAgentExecution } from './xpert-agent-execution.model'
import { IXpert } from './xpert.model'

export enum XpertTaskStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

/**
 * Tools for Xpert
 */
export interface IXpertTask extends IBasePerTenantAndOrganizationEntityModel, XpertTaskType {}

export type XpertTaskType = {
  name?: string
  schedule?: string
  timeZone?: string
  prompt?: string
  status?: XpertTaskStatus

  xpert?: IXpert
  xpertId?: string
  agentKey?: string
  executions?: IXpertAgentExecution[]

  // Temporary properties
  job?: any
  scheduleDescription?: string
  executionCount?: number
  errorCount?: number
  successCount?: number
}
