import { Injectable } from '@nestjs/common'
import {
    AiModelTypeEnum,
    DEFAULT_MEMBERSHIP_CNY_PER_POINT,
    IMembershipAdminUser,
    IMembershipAdminUsersQuery,
    IMembershipBulkActionResult,
    IMembershipMe,
    IMembershipPlan,
    IMembershipScopeStatus,
    IMembershipUsageOverview,
    IMembershipUsageQuery,
    IMembershipUsageSummary,
    IModelAccessResolution,
    IPagination,
    TMembershipAssignInput,
    TMembershipBulkActionInput,
    TMembershipCurrentPeriodUpgradeInput,
    TMembershipOrganizationPurchasePlanInput,
    TMembershipPeriodCancelInput,
    TMembershipPeriodsAppendInput,
    TMembershipPeriodsRefundReservationInput,
    TMembershipPersonalPointsAdjustmentInput,
    TMembershipPlanReassignInput,
    TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { MembershipAccessService } from './consumption/membership-access.service'
import { MembershipAdminService } from './members/membership-admin.service'
import { MembershipBackfillService } from './initialization/membership-backfill.service'
import { MembershipBillingService } from './consumption/membership-billing.service'
import { MembershipInitializationService } from './initialization/membership-initialization.service'
import { MembershipLifecycleService } from './periods/membership-lifecycle.service'
import { MembershipPeriod } from './membership-period.entity'
import { MembershipPeriodsService } from './periods/membership-periods.service'
import { MembershipPlan } from './membership-plan.entity'
import { MembershipPlansService } from './plans/membership-plans.service'
import { MembershipPointLedger } from './membership-point-ledger.entity'
import { MembershipPolicyService } from './members/membership-policy.service'
import { MembershipRefundsService } from './periods/membership-refunds.service'
import { isModelAllowed, resolveModelMultiplierForPlan } from './plans/membership-rules'
import { MembershipUsageService } from './consumption/membership-usage.service'
import { calculatePointsFromCny } from './membership-utils'
import { MembershipWalletService } from './consumption/membership-wallet.service'
import {
    BillableUserInput,
    EnsureScopeInitializedInput,
    EnsureTenantDefaultMembershipInput,
    MembershipModelAccess,
    MembershipPeriodSettlementResult,
    RecordGatewayUsageInput,
    RecordGatewayUsageResult,
    RecordUsageInput,
    ResolveScopeInput
} from './membership.types'
import { UserMembership } from './user-membership.entity'
export { XpertBillingPayer } from './membership.types'
export type {
    MembershipModelAccess,
    MembershipPeriodSettlementResult,
    RecordGatewayUsageInput,
    RecordGatewayUsageResult
} from './membership.types'

@Injectable()
export class MembershipService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly plans: MembershipPlansService,
        private readonly initialization: MembershipInitializationService,
        private readonly admin: MembershipAdminService,
        private readonly backfill: MembershipBackfillService,
        private readonly lifecycle: MembershipLifecycleService,
        private readonly periods: MembershipPeriodsService,
        private readonly refunds: MembershipRefundsService,
        private readonly wallet: MembershipWalletService,
        private readonly usage: MembershipUsageService,
        private readonly billing: MembershipBillingService,
        private readonly access: MembershipAccessService
    ) {}

    async isMembershipPlanEnabled(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        return this.policy.isMembershipPlanEnabled(input, manager)
    }

    async isMembershipAccessEnabled(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        return this.policy.isMembershipAccessEnabled(input, manager)
    }

    /** Includes catalog-derived plans because they also configure effective organization access. */
    async hasActiveMembershipPlan(input?: ResolveScopeInput, manager?: EntityManager): Promise<boolean> {
        return this.policy.hasActiveMembershipPlan(input, manager)
    }

    async findPlans(): Promise<MembershipPlan[]> {
        return this.plans.findPlans()
    }

    async createPlan(input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        return this.plans.createPlan(input)
    }

    async updatePlan(id: string, input: Partial<MembershipPlan>): Promise<MembershipPlan> {
        return this.plans.updatePlan(id, input)
    }

    async archivePlan(id: string): Promise<MembershipPlan> {
        return this.plans.archivePlan(id)
    }

    async deletePlan(id: string): Promise<void> {
        return this.plans.deletePlan(id)
    }

    async reassignPlanMembers(planId: string, input: TMembershipPlanReassignInput) {
        return this.plans.reassignPlanMembers(planId, input)
    }

    async getScopeStatus(input?: ResolveScopeInput, manager?: EntityManager): Promise<IMembershipScopeStatus> {
        return this.initialization.getScopeStatus(input, manager)
    }

    async ensureScopeInitialized(
        input?: EnsureScopeInitializedInput,
        manager?: EntityManager
    ): Promise<IMembershipScopeStatus> {
        return this.initialization.ensureScopeInitialized(input, manager)
    }

    async ensureUserAssignedIfScopeInitialized(input: EnsureScopeInitializedInput & { userId: string }) {
        return this.initialization.ensureUserAssignedIfScopeInitialized(input)
    }

    async enqueueOrganizationDefaultMembershipInitialization(input: {
        tenantId: string
        organizationId: string
        actorUserId?: string | null
    }): Promise<boolean> {
        return this.initialization.enqueueOrganizationDefaultMembershipInitialization(input)
    }

    async canInitializeOrganizationDefaultMembership(input: {
        tenantId: string
        organizationId?: string | null
        actorUserId?: string | null
    }): Promise<boolean> {
        return this.initialization.canInitializeOrganizationDefaultMembership(input)
    }

    async revokeOrganizationMembershipForRemovedUser(input: {
        tenantId: string
        organizationId: string
        userId: string
    }): Promise<UserMembership | null> {
        return this.admin.revokeOrganizationMembershipForRemovedUser(input)
    }

    async ensureTenantDefaultMembership(
        input: EnsureTenantDefaultMembershipInput,
        manager?: EntityManager
    ): Promise<UserMembership | null> {
        return this.initialization.ensureTenantDefaultMembership(input, manager)
    }

    async backfillTenantDefaultMembershipBatch(input: {
        tenantId: string
        afterUserId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }> {
        return this.backfill.backfillTenantDefaultMembershipBatch(input)
    }

    async backfillOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        organizationId: string
        actorUserId: string
        afterUserOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        assigned: number
        nextCursor: string | null
    }> {
        return this.backfill.backfillOrganizationDefaultMembershipBatch(input)
    }

    async backfillTenantOrganizationDefaultMembershipBatch(input: {
        tenantId: string
        actorUserId: string
        afterOrganizationId?: string | null
        take?: number
    }): Promise<{
        scanned: number
        enqueued: number
        nextCursor: string | null
    }> {
        return this.backfill.backfillTenantOrganizationDefaultMembershipBatch(input)
    }

    async findAdminUsers(options?: {
        userId?: string
        planId?: string
        take?: number
        skip?: number
    }): Promise<IPagination<UserMembership>> {
        return this.admin.findAdminUsers(options)
    }

    async findAdminUserScopeMemberships(userId: string): Promise<UserMembership[]> {
        return this.admin.findAdminUserScopeMemberships(userId)
    }

    async findAdminMembers(options: IMembershipAdminUsersQuery = {}): Promise<IPagination<IMembershipAdminUser>> {
        return this.admin.findAdminMembers(options)
    }

    async applyBulkUserAction(input: TMembershipBulkActionInput): Promise<IMembershipBulkActionResult> {
        return this.admin.applyBulkUserAction(input)
    }

    async findAdminUserAudit(
        userId: string,
        pagination: { take?: number; skip?: number } = {}
    ): Promise<IPagination<MembershipPointLedger>> {
        return this.admin.findAdminUserAudit(userId, pagination)
    }

    async processDueMembershipPeriods(limit = 100): Promise<MembershipPeriodSettlementResult> {
        return this.lifecycle.processDueMembershipPeriods(limit)
    }

    async assignUser(userId: string, input: TMembershipAssignInput): Promise<UserMembership> {
        return this.admin.assignUser(userId, input)
    }

    async adjustUserPoints(userId: string, input: TMembershipPointAdjustInput): Promise<UserMembership> {
        return this.admin.adjustUserPoints(userId, input)
    }

    async renewUser(userId: string): Promise<UserMembership> {
        return this.admin.renewUser(userId)
    }

    async appendMembershipPeriods(
        input: TMembershipPeriodsAppendInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        return this.periods.appendMembershipPeriods(input, manager)
    }

    async resolveOrganizationPurchasePlan(
        input: TMembershipOrganizationPurchasePlanInput,
        manager?: EntityManager
    ): Promise<MembershipPlan> {
        return this.periods.resolveOrganizationPurchasePlan(input, manager)
    }

    async upgradeCurrentMembershipPeriod(
        input: TMembershipCurrentPeriodUpgradeInput,
        manager?: EntityManager
    ): Promise<UserMembership> {
        return this.periods.upgradeCurrentMembershipPeriod(input, manager)
    }

    async ensureActiveMembershipPeriod(
        input: {
            tenantId: string
            organizationId: string | null
            userId: string
            membershipId: string
        },
        manager?: EntityManager
    ): Promise<MembershipPeriod> {
        return this.periods.ensureActiveMembershipPeriod(input, manager)
    }

    async findMyPeriods(): Promise<MembershipPeriod[]> {
        return this.periods.findMyPeriods()
    }

    async findAdminUserPeriods(userId: string): Promise<MembershipPeriod[]> {
        return this.periods.findAdminUserPeriods(userId)
    }

    async cancelAdminUserPeriod(userId: string, periodId: string): Promise<MembershipPeriod> {
        return this.refunds.cancelAdminUserPeriod(userId, periodId)
    }

    async cancelScheduledMembershipPeriod(
        input: TMembershipPeriodCancelInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod> {
        return this.refunds.cancelScheduledMembershipPeriod(input, manager)
    }

    async reserveFutureMembershipPeriodsForRefund(
        input: TMembershipPeriodsRefundReservationInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        return this.refunds.reserveFutureMembershipPeriodsForRefund(input, manager)
    }

    async finalizeFutureMembershipPeriodsRefund(
        input: TMembershipPeriodsRefundReservationInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        return this.refunds.finalizeFutureMembershipPeriodsRefund(input, manager)
    }

    async pauseUser(userId: string): Promise<UserMembership> {
        return this.admin.pauseUser(userId)
    }

    async resumeUser(userId: string): Promise<UserMembership> {
        return this.admin.resumeUser(userId)
    }

    async revokeUser(userId: string): Promise<UserMembership> {
        return this.admin.revokeUser(userId)
    }

    async getPersonalPoints(userId: string) {
        return this.wallet.getPersonalPoints(userId)
    }

    async adjustPersonalPoints(userId: string, input: TMembershipPointAdjustInput) {
        return this.wallet.adjustPersonalPoints(userId, input)
    }

    async applyPersonalPointsAdjustment(input: TMembershipPersonalPointsAdjustmentInput, manager?: EntityManager) {
        return this.wallet.applyPersonalPointsAdjustment(input, manager)
    }

    async getMe(): Promise<IMembershipMe | null> {
        return this.usage.getMe()
    }

    async getOverview(query?: IMembershipUsageQuery): Promise<IMembershipUsageOverview> {
        return this.usage.getOverview(query)
    }

    async findMyUsage(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<MembershipPointLedger>> {
        return this.usage.findMyUsage(query, options)
    }

    async findMyUsageSummaries(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<IMembershipUsageSummary>> {
        return this.usage.findMyUsageSummaries(query, options)
    }

    async findUserUsageSummaries(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number },
        membershipId?: string,
        organizationId?: string | null
    ): Promise<IPagination<IMembershipUsageSummary>> {
        return this.usage.findUserUsageSummaries(tenantId, userId, query, options, membershipId, organizationId)
    }

    async findUserUsage(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number },
        membershipId?: string,
        organizationId?: string | null
    ): Promise<IPagination<MembershipPointLedger>> {
        return this.usage.findUserUsage(tenantId, userId, query, options, membershipId, organizationId)
    }

    async assertCanUse(
        input: Pick<
            RecordUsageInput,
            | 'tenantId'
            | 'organizationId'
            | 'copilotOrganizationId'
            | 'userId'
            | 'xpertId'
            | 'copilotId'
            | 'provider'
            | 'model'
        >,
        modelAccess?: IModelAccessResolution
    ): Promise<void> {
        return this.billing.assertCanUse(input, modelAccess)
    }

    async recordUsage(input: RecordUsageInput): Promise<MembershipPointLedger | null> {
        return this.billing.recordUsage(input)
    }

    async recordGatewayUsage(input: RecordGatewayUsageInput): Promise<RecordGatewayUsageResult> {
        return this.billing.recordGatewayUsage(input)
    }

    async resolveBillableUserId(input: BillableUserInput, manager?: EntityManager): Promise<string> {
        return this.access.resolveBillableUserId(input, manager)
    }

    calculatePointsFromCny(amount: number, cnyPerPoint = DEFAULT_MEMBERSHIP_CNY_PER_POINT): number {
        return calculatePointsFromCny(amount, cnyPerPoint)
    }

    resolveModelMultiplierForPlan(plan: Pick<IMembershipPlan, 'modelMultipliers'>, provider?: string, model?: string) {
        return resolveModelMultiplierForPlan(plan, provider, model)
    }

    async hasConsumableBalance(access: MembershipModelAccess): Promise<boolean> {
        return this.access.hasConsumableBalance(access)
    }

    isModelAllowed(
        plan: Pick<IMembershipPlan, 'allowedModels'>,
        provider?: string,
        model?: string,
        copilotId?: string,
        modelType?: AiModelTypeEnum
    ): boolean {
        return isModelAllowed(plan, provider, model, copilotId, modelType)
    }

    async findModelAccess(
        input?: {
            tenantId?: string | null
            organizationId?: string | null
            userId?: string | null
            xpertId?: string | null
        },
        manager?: EntityManager,
        forUpdate = false
    ): Promise<MembershipModelAccess | null> {
        return this.access.findModelAccess(input, manager, forUpdate)
    }

    async isActiveOrganizationMember(tenantId: string, organizationId: string, userId: string): Promise<boolean> {
        return this.policy.isActiveOrganizationMember(tenantId, organizationId, userId)
    }

    async countEnabledOrganizationCopilots(tenantId: string, organizationId: string | null, manager?: EntityManager) {
        return this.initialization.countEnabledOrganizationCopilots(tenantId, organizationId, manager)
    }
}
