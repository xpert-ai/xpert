import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ScheduleTaskStatus, TScheduleOptions } from '../schedule'
import type { TXpertChatState } from '@xpert-ai/chatkit-types'
import { IChatConversation } from './chat.model'
import { JsonSchemaObjectType } from './types'
import { IXpert } from './xpert.model'
import { IXpertProject } from './xpert-project.model'
import { IUser } from '../user.model'

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
  /** User-visible reason explaining why a scheduled task was paused. */
  statusReason?: string | null
  runtimeState?: TXpertChatState | null

  xpert?: IXpert
  xpertId?: string
  agentKey?: string
  project?: IXpertProject
  projectId?: string
  /** Human identity whose permissions and personal Connector accounts are used at execution time. */
  runAsUser?: IUser
  runAsUserId?: string
  /** Pending replacement identity; it becomes active only after this user accepts. */
  pendingRunAsUserId?: string | null
  /** User who initiated the pending run-as transfer. */
  pendingRunAsRequestedById?: string | null
  pendingRunAsRequestedAt?: Date | null
  /** Snapshot of the Xpert and Connector selection that the proposed run-as user is confirming. */
  pendingRunAsConfigurationHash?: string | null
  // One to many
  conversations?: IChatConversation[]

  // Temporary properties
  job?: any
  scheduleDescription?: string
  executionCount?: number
  errorCount?: number
  successCount?: number
}
