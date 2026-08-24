import { IBasePerTenantAndOrganizationEntityModel, IBasePerTenantEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'
import { AiModelTypeEnum } from '../agent'
import { ModelAccessSourceEnum } from './model-access.model'
import { ModelGatewayUsageChannelEnum } from './model-gateway.model'
import type { LLMPriceAuthority, LLMPriceBreakdownItem } from './ai-model.model'
import type {
  ModelUsageMetric,
  ModelUsageMetricComponent,
  ModelUsageLedgerModality,
  ModelUsageLedgerOperation,
  ModelUsageOriginType,
  ModelUsagePriceRule,
  ModelUsagePricingDimensions,
  ModelUsagePricingStatus
} from './model-usage.model'

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
  RefundPending = 'refund_pending',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled'
}

export const DEFAULT_MEMBERSHIP_CNY_PER_POINT = 0.1
export const MEMBERSHIP_CNY_PER_POINT_SETTING = 'membershipCnyPerPoint'

export enum MembershipLedgerSourceEnum {
  Assignment = 'assignment',
  Grant = 'grant',
  Renew = 'renew',
  Upgrade = 'upgrade',
  Usage = 'usage',
  Adjustment = 'adjustment',
  StatusChange = 'status_change',
  PersonalAdjustment = 'personal_adjustment',
  PersonalUsage = 'personal_usage',
  ModelUsage = 'model_usage'
}

export enum MembershipAdminUserStatusEnum {
  Active = 'active',
  Paused = 'paused',
  Expired = 'expired',
  Unassigned = 'unassigned'
}

export enum MembershipBulkActionEnum {
  Assign = 'assign',
  Renew = 'renew',
  Pause = 'pause',
  Resume = 'resume',
  Revoke = 'revoke'
}

export type TMembershipRateLimitPeriod = 'hour' | 'day' | 'week' | 'cycle'

export interface IMembershipModelMultiplier {
  provider?: string | null
  model?: string | null
  /** Applied to the CNY settlement amount before it is converted to membership points. */
  multiplier: number
}

export interface IMembershipAllowedModel {
  provider: string
  model: string
  copilotId?: string
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
  level: number
  catalogSourcePlanId?: string | null
  status: MembershipPlanStatusEnum
  isDefault?: boolean
  period: MembershipPeriodEnum
  includedPoints: number | null
  /** @deprecated Sale pricing is owned by the Pro billing product. Retained temporarily for migration only. */
  priceAmount?: number | null
  /** @deprecated Sale pricing is owned by the Pro billing product. Retained temporarily for migration only. */
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
  level: number
  catalogSourcePlanId?: string | null
  period: MembershipPeriodEnum
  includedPoints: number | null
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
  userId?: string | null
  user?: IUser
  actorId?: string | null
  actor?: IUser
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
  accessSource?: ModelAccessSourceEnum | null
  modelGrantId?: string | null
  usageChannel?: ModelGatewayUsageChannelEnum | null
  gatewayRequestId?: string | null
  gatewayApiKeyId?: string | null
  chargedPoints?: number | null
  excessPoints?: number | null
  requestId?: string | null
  revision?: number | null
  originType?: ModelUsageOriginType | null
  originId?: string | null
  originExecutionId?: string | null
  providerScopeId?: string | null
  modelType?: AiModelTypeEnum | null
  toolName?: string | null
  modality?: ModelUsageLedgerModality | null
  operation?: ModelUsageLedgerOperation | null
  metricKey?: string | null
  component?: ModelUsageMetricComponent | null
  pricingDimensions?: ModelUsagePricingDimensions | null
  unit?: ModelUsageMetric['unit'] | null
  authority?: ModelUsageMetric['authority'] | null
  quantity?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  recordedAt?: Date | string | null
  pricingStatus?: ModelUsagePricingStatus | null
  pricingRuleId?: string | null
  pricingRuleVersion?: string | null
  priceQuantity?: number | null
  unitSize?: number | null
  unitPrice?: number | null
  priceCurrency?: string | null
  priceAmount?: number | null
  priceAuthority?: LLMPriceAuthority | null
  pricingRule?: ModelUsagePriceRule | null
  pricingBreakdown?: LLMPriceBreakdownItem[] | null
  chargedAt?: Date | string | null
  settlementCurrency?: string | null
  settlementAmount?: number | null
  exchangeRate?: number | null
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

export interface IMembershipAdminUser {
  user: IUser
  membership?: IUserMembership | null
  scheduledPeriodCount: number
}

export interface IMembershipAdminUsersQuery {
  search?: string
  status?: MembershipAdminUserStatusEnum
  planId?: string
  expiringBefore?: string
  take?: number
  skip?: number
}

export type TMembershipBulkActionInput = {
  userIds: string[]
  action: MembershipBulkActionEnum
  planId?: string
  renewalMode?: MembershipRenewalModeEnum
  note?: string | null
}

export interface IMembershipBulkActionFailure {
  userId: string
  message: string
}

export interface IMembershipBulkActionResult {
  succeeded: number
  failed: IMembershipBulkActionFailure[]
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
  usageChannel?: ModelGatewayUsageChannelEnum | null
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

export interface IMembershipUsageOverview extends Partial<IMembershipMe> {
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

export type TMembershipPersonalPointsAdjustmentInput = {
  tenantId: string
  userId: string
  actorId?: string | null
  pointDelta: number
  sourceReference: string
  reason?: string | null
}

export type TMembershipPlanReassignInput = {
  targetPlanId: string
}

export type TMembershipPeriodsAppendInput = {
  tenantId: string
  organizationId?: string | null
  userId: string
  actorId?: string | null
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

export type TMembershipPeriodsRefundReservationInput = {
  tenantId: string
  organizationId?: string | null
  userId: string
  sourceReference: string
}

export type TMembershipOrganizationPurchasePlanInput = {
  tenantId: string
  organizationId: string
  userId: string
  catalogSourcePlanId: string
  planSnapshot: IMembershipPlanSnapshot
}

export type TMembershipCurrentPeriodUpgradeInput = {
  tenantId: string
  organizationId?: string | null
  userId: string
  actorId?: string | null
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
  usageChannel?: ModelGatewayUsageChannelEnum
  provider?: string
  model?: string
  organizationId?: string
  xpertId?: string
  threadId?: string
  copilotId?: string
  usageHour?: string
}
