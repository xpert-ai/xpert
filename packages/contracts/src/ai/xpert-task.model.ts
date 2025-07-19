import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ScheduleTaskStatus, TScheduleOptions } from '../schedule'
import { IChatConversation } from './chat.model'
import { IXpert } from './xpert.model'


/**
 * Tools for Xpert
 */
export interface IXpertTask extends IBasePerTenantAndOrganizationEntityModel, XpertTaskType {}

export type XpertTaskType = {
  name?: string
  schedule?: string
  options?: TScheduleOptions
  timeZone?: string
  prompt?: string
  status?: ScheduleTaskStatus

  xpert?: IXpert
  xpertId?: string
  agentKey?: string
  // One to many
  conversations?: IChatConversation[]

  // Temporary properties
  job?: any
  scheduleDescription?: string
  executionCount?: number
  errorCount?: number
  successCount?: number
}
