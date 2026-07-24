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

export enum MembershipSourceEnum {
  TenantDefault = 'tenant_default',
  Organization = 'organization',
  Admin = 'admin',
  External = 'external'
}

export enum MembershipRenewalModeEnum {
  Auto = 'auto',
  Manual = 'manual'
}

export enum MembershipPeriodStatusEnum {
  Scheduled = 'scheduled',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled'
}

export const DEFAULT_MEMBERSHIP_TOKENS_PER_POINT = 1000
export const MEMBERSHIP_TOKENS_PER_POINT_SETTING = 'membershipTokensPerPoint'
export const MEMBERSHIP_TOKENS_PER_POINT_OPTIONS = [1000, 10000, 100000, 1000000] as const

export enum MembershipLedgerSourceEnum {
  Assignment = 'assignment',
  Grant = 'grant',
  Renew = 'renew',
  Upgrade = 'upgrade',
  Usage = 'usage',
  Adjustment = 'adjustment',
  StatusChange = 'status_change',
  PersonalAdjustment = 'personal_adjustment',
  PersonalUsage = 'personal_usage'
}

export type TMembershipRateLimitPeriod = 'hour' | 'day' | 'week' | 'cycle'

export interface IMembershipModelMultiplier {
  provider?: string | null
  model?: string | null
  multiplier: number
}

export interface IMembershipAllowedModel {
  provider: string
  model: string
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
  includedPoints: number | null
  tokensPerPoint: number
  priceAmount?: number | null
  priceCurrency?: string | null
  allowedModels?: IMembershipAllowedModel[]
  modelMultipliers?: IMembershipModelMultiplier[]
  rateLimits?: IMembershipRateLimit[]
}

export interface IMembershipPlanSnapshot {
  planId?: string | null
  code: string
  name: string
  description?: string | null
  period: MembershipPeriodEnum
  includedPoints: number | null
  tokensPerPoint: number
  allowedModels?: IMembershipAllowedModel[]
  modelMultipliers?: IMembershipModelMultiplier[]
  rateLimits?: IMembershipRateLimit[]
}

export interface IUserMembership extends IBasePerTenantAndOrganizationEntityModel {
  userId: string
  user?: IUser
  planId?: string | null
  plan?: IMembershipPlan
  status: MembershipStatusEnum
  source: MembershipSourceEnum
  renewalMode: MembershipRenewalModeEnum
  currentPeriodStart: Date
  currentPeriodEnd: Date
  pointsGranted: number | null
  pointsUsed: number
  pointsTotalUsed: number
  planSnapshot?: IMembershipPlanSnapshot | null
  assignedById?: string | null
  assignedBy?: IUser
  note?: string | null
}

export interface IUserMembershipPeriod extends IBasePerTenantAndOrganizationEntityModel {
  membershipId: string
  membership?: IUserMembership
  userId: string
  user?: IUser
  planId?: string | null
  plan?: IMembershipPlan
  status: MembershipPeriodStatusEnum
  periodStart: Date
  periodEnd: Date
  pointsGranted: number | null
  pointsUsed: number
  source: MembershipSourceEnum
  renewalMode: MembershipRenewalModeEnum
  sourceReference?: string | null
  sourceSequence: number
  planSnapshot: IMembershipPlanSnapshot
}

export interface IMembershipPointLedger extends IBasePerTenantEntityModel {
  userId: string
  user?: IUser
  membershipId?: string | null
  membership?: IUserMembership
  planId?: string | null
  plan?: IMembershipPlan
  source: MembershipLedgerSourceEnum
  pointsDelta: number
  tokenUsed?: number | null
  provider?: string | null
  model?: string | null
  organizationId?: string | null
  runtimeOrganizationId?: string | null
  xpertId?: string | null
  threadId?: string | null
  copilotId?: string | null
  usageHour?: string | null
  sourceReference?: string | null
  reason?: string | null
}

export interface IMembershipMe {
  membership: IUserMembership
  plan: IMembershipPlan
  personalPointsOnly: boolean
  pointsGranted: number | null
  pointsUsed: number
  pointsRemaining: number | null
  pointsTotalUsed: number
  currentPeriodStart: Date
  currentPeriodEnd: Date
  personalPointsBalance: number
}

export interface IUserPersonalPoints {
  userId: string
  balance: number
}

export interface IMembershipScopeStatus {
  tenantId: string
  organizationId?: string | null
  scope: 'tenant' | 'organization'
  planCount: number
  activePlanCount: number
  defaultPlan?: IMembershipPlan | null
  initialized: boolean
  needsRepair: boolean
  activeMemberCount?: number | null
  assignedMemberCount?: number | null
  localCopilotCount?: number | null
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
  source?: MembershipSourceEnum
  renewalMode?: MembershipRenewalModeEnum
  note?: string | null
}

export type TMembershipPointAdjustInput = {
  pointDelta: number
  reason?: string | null
}

export type TMembershipPlanReassignInput = {
  targetPlanId: string
}

export type TMembershipPeriodsAppendInput = {
  tenantId: string
  organizationId?: string | null
  userId: string
  planId: string
  count: number
  source?: MembershipSourceEnum
  renewalMode?: MembershipRenewalModeEnum
  sourceReference?: string | null
  startAt?: string | Date
  planSnapshot?: IMembershipPlanSnapshot
}

export type TMembershipPeriodCancelInput = {
  tenantId: string
  organizationId?: string | null
  userId: string
  periodId: string
  sourceReference?: string | null
}

export type TMembershipCurrentPeriodUpgradeInput = {
  tenantId: string
  organizationId?: string | null
  userId: string
  planId: string
  pointsDelta: number
  sourceReference: string
  source?: MembershipSourceEnum
  renewalMode?: MembershipRenewalModeEnum
  planSnapshot?: IMembershipPlanSnapshot
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
