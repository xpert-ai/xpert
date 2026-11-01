import { IMembershipPlan, IModelAccessResolution, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { UserMembership } from './user-membership.entity'

export enum XpertBillingPayer {
    RuntimeUser = 'runtime_user',
    Creator = 'xpert_creator'
}

export type RecordUsageInput = {
    tenantId: string
    organizationId?: string | null
    copilotOrganizationId?: string | null
    userId: string
    provider?: string
    model?: string
    tokenUsed?: number
    priceAmount?: number | null
    priceCurrency?: string | null
    settlementAmount?: number | null
    settlementCurrency?: string | null
    exchangeRate?: number | null
    sourceReference?: string | null
    usageHour?: string
    xpertId?: string
    threadId?: string
    copilotId?: string
    modelAccess?: IModelAccessResolution
}

export type RecordGatewayUsageInput = RecordUsageInput & {
    gatewayRequestId: string
    gatewayApiKeyId: string
    modelAccess: IModelAccessResolution
}

export type RecordGatewayUsageResult = {
    chargedPoints: number
    excessPoints: number
    ledger: MembershipPointLedger | null
}

export type BillableUserInput = Pick<RecordUsageInput, 'tenantId' | 'userId' | 'xpertId'> & {
    xpertBillingPayer?: XpertBillingPayer
}

export type MembershipWithPlan = UserMembership & { plan: IMembershipPlan }

export type MembershipAdminUserRow = User & { membership?: UserMembership | null }

export type MembershipScope = {
    tenantId: string
    organizationId: string | null
}

export interface MembershipPeriodSettlementResult {
    scanned: number
    settled: number
    skipped: number
    failed: number
}

export type ResolveScopeInput = {
    tenantId?: string | null
    organizationId?: string | null
}

export type EnsureScopeInitializedInput = ResolveScopeInput & {
    assignedById?: string | null
}

export type EnsureTenantDefaultMembershipInput = {
    tenantId: string
    userId: string
}

export type MembershipModelAccess = {
    tenantId: string
    organizationId: string | null
    membership: MembershipWithPlan
    persistedMembership?: MembershipWithPlan
    personalPointsOnly?: boolean
}

export type NumericRaw = Record<string, string | number | null | undefined>

export type MembershipUsageSummaryRaw = NumericRaw & {
    usageHour?: string | null
    usageChannel?: ModelGatewayUsageChannelEnum | null
    provider?: string | null
    model?: string | null
    organizationId?: string | null
    xpertId?: string | null
    threadId?: string | null
    copilotId?: string | null
    conversationTitle?: string | null
    xpertTitle?: string | null
    xpertName?: string | null
    firstUsedAt?: Date | string | null
    lastUsedAt?: Date | string | null
}
