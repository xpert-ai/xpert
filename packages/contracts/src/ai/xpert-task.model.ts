import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
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
  prompt?: string
  status?: XpertTaskStatus

  xpert?: IXpert
  xpertId?: string
  agentKey?: string
  
  // Temporary properties
  job?: any
  scheduleDescription?: string
}
