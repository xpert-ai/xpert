import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ScheduleTaskStatus, TScheduleOptions } from '../schedule'
import type { TXpertChatState } from '@xpert-ai/chatkit-types'
import { IChatConversation } from './chat.model'
import { JsonSchemaObjectType } from './types'
import { IXpert } from './xpert.model'

export const XPERT_TASK_SCHEDULE_PROPERTY_PREFIX = 'xpert_task_'
export const XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY = '__idempotency_key'

export type TXpertTaskScheduleCapabilities = {
  xpertId: string
  agentKey?: string
  stateVariables: {
    name: string
    type?: string
    description?: unknown
  }[]
  stateSchema?: JsonSchemaObjectType
}

export type TXpertTaskScheduleRuntimeState = {
  [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]?: string
}

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
  runtimeState?: TXpertChatState | null

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
