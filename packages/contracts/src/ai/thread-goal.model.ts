import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

export const THREAD_GOAL_STATUS_VALUES = [
  'active',
  'paused',
  'blocked',
  // Reserved for future usage-quota enforcement. No backend path emits this status yet.
  'usage_limited',
  'budget_limited',
  'complete'
] as const

export type ThreadGoalStatus = (typeof THREAD_GOAL_STATUS_VALUES)[number]

export type ThreadGoalUserStatus = Extract<ThreadGoalStatus, 'active' | 'paused'>
export type ThreadGoalModelStatus = Extract<ThreadGoalStatus, 'complete' | 'blocked'>

export interface IThreadGoal extends IBasePerTenantAndOrganizationEntityModel {
  conversationId: string
  threadId: string
  objective: string
  status: ThreadGoalStatus
  tokensUsed: number
  elapsedSeconds: number
  continuationCount: number
  statusUpdatedAt?: Date | string | null
  completedAt?: Date | string | null
  blockedAt?: Date | string | null
}

export type TThreadGoalSetRequest = {
  objective: string
}

export type TThreadGoalPatchRequest = {
  objective?: string
  status?: ThreadGoalUserStatus
}

export function isRunnableThreadGoalStatus(status: ThreadGoalStatus | null | undefined): boolean {
  return status === 'active'
}
