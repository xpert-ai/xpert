import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export const COPILOT_CHECKPOINT_RETENTION_DAYS_SETTING = 'copilotCheckpointRetentionDays'
export const COPILOT_CHECKPOINT_RETENTION_ENABLED_SETTING = 'copilotCheckpointRetentionEnabled'
export const MIN_COPILOT_CHECKPOINT_RETENTION_DAYS = 1
export const DEFAULT_COPILOT_CHECKPOINT_RETENTION_DAYS = 60
export const MAX_COPILOT_CHECKPOINT_RETENTION_DAYS = 3650

/**
 * Checkpoints for copilot, for langgraph framework
 */
export interface ICopilotCheckpoint extends IBasePerTenantAndOrganizationEntityModel {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_id?: string
  type?: string
  checkpoint: Uint8Array
  metadata: Uint8Array
}

export interface ICopilotCheckpointWrites extends IBasePerTenantAndOrganizationEntityModel {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  task_id?: string
  idx?: number
  channel?: string
  type?: string
  value: Uint8Array
}
