import { IBasePerTenantAndOrganizationEntityModel, IBasePerTenantEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'

export enum MembershipPlanStatusEnum {
  Active = 'active',
  Archived = 'archived'
}

export enum MembershipPeriodEnum {
  Monthly = 'monthly'
}

export enum MembershipStatusEnum {
  Active = 'active',
  Paused = 'paused',
  Expired = 'expired'
}

export enum MembershipLedgerSourceEnum {
  Assignment = 'assignment',
  Grant = 'grant',
  Renew = 'renew',
  Usage = 'usage',
  Adjustment = 'adjustment'
}

export type TMembershipRateLimitPeriod = 'hour' | 'day' | 'week' | 'cycle'

export interface IMembershipModelMultiplier {
  provider?: string | null
  model?: string | null
  multiplier: number
}

export interface IMembershipRateLimit {
  provider?: string | null
  model?: string | null
  period: TMembershipRateLimitPeriod
  pointLimit: number
}

export interface IMembershipPlan extends IBasePerTenantAndOrganizationEntityModel {
  code: string
  name: string
  description?: string | null
  status: MembershipPlanStatusEnum
  isDefault?: boolean
  period: MembershipPeriodEnum
  includedPoints: number
  tokensPerPoint: number
  priceAmount?: number | null
  priceCurrency?: string | null
  modelMultipliers?: IMembershipModelMultiplier[]
  rateLimits?: IMembershipRateLimit[]
}

export interface IUserMembership extends IBasePerTenantAndOrganizationEntityModel {
  userId: string
  user?: IUser
  planId: string
  plan?: IMembershipPlan
  status: MembershipStatusEnum
  currentPeriodStart: Date
  currentPeriodEnd: Date
  pointsGranted: number
  pointsUsed: number
  pointsTotalUsed: number
  assignedById?: string | null
  assignedBy?: IUser
  note?: string | null
}

export interface IMembershipPointLedger extends IBasePerTenantEntityModel {
  userId: string
  user?: IUser
  membershipId: string
  membership?: IUserMembership
  planId?: string | null
  plan?: IMembershipPlan
  source: MembershipLedgerSourceEnum
  pointsDelta: number
  tokenUsed?: number | null
  provider?: string | null
  model?: string | null
  organizationId?: string | null
  xpertId?: string | null
  threadId?: string | null
  copilotId?: string | null
  usageHour?: string | null
  reason?: string | null
}

export interface IMembershipMe {
  membership: IUserMembership
  plan: IMembershipPlan
  pointsGranted: number
  pointsUsed: number
  pointsRemaining: number
  pointsTotalUsed: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
}

export interface IMembershipUsageBucket {
  date: string
  pointsUsed: number
  tokenUsed: number
}

export interface IMembershipUsageRank {
  key: string
  label?: string | null
  pointsUsed: number
  tokenUsed: number
}

export interface IMembershipUsageGroupKey {
  usageHour?: string | null
  provider?: string | null
  model?: string | null
  organizationId?: string | null
  xpertId?: string | null
  threadId?: string | null
  copilotId?: string | null
}

export interface IMembershipUsageSummary extends IMembershipUsageGroupKey {
  groupKey: IMembershipUsageGroupKey
  conversationTitle?: string | null
  xpertTitle?: string | null
  xpertName?: string | null
  callCount: number
  pointsDelta: number
  pointsUsed: number
  tokenUsed: number
  firstUsedAt?: Date | string | null
  lastUsedAt?: Date | string | null
}

export interface IMembershipUsageOverview extends IMembershipMe {
  totalTokens: number
  peakDailyTokens: number
  activeDays: number
  buckets: IMembershipUsageBucket[]
  topModels: IMembershipUsageRank[]
  topXperts: IMembershipUsageRank[]
  topThreads: IMembershipUsageRank[]
}

export type TMembershipAssignInput = {
  planId: string
  currentPeriodStart?: string | Date
  currentPeriodEnd?: string | Date
  note?: string | null
}

export type TMembershipPointAdjustInput = {
  pointDelta: number
  reason?: string | null
}

export interface IMembershipUsageQuery {
  start?: string
  end?: string
  provider?: string
  model?: string
  organizationId?: string
  xpertId?: string
  threadId?: string
  copilotId?: string
  usageHour?: string
}
