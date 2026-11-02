import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import {
    IModelAccessResolution,
    MembershipLedgerSourceEnum,
    ModelAccessSourceEnum,
    ModelGatewayUsageChannelEnum
} from '@xpert-ai/contracts'
import { DataSource, Repository } from 'typeorm'
import { ExceedingLimitException } from '../../core/errors'
import { formatInUTC0 } from '../../shared/utils'
import { MembershipAccessService } from './membership-access.service'
import { MembershipLifecycleService } from '../periods/membership-lifecycle.service'
import { acquireGatewayRequestLock, acquirePersonalPointsLock, acquireUsageSourceLock } from '../membership-locks'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import { assertModelAllowed, resolveModelMultiplier } from '../plans/membership-rules'
import {
    applyScopeFilter,
    applySettlementMultiplier,
    assertCopilotScopeMatches,
    billingLedgerFields,
    calculatePointsFromCny,
    cnyFromPoints,
    getMembershipPointsRemaining,
    hydrateMembershipPlanSnapshot,
    nonNegativeBillingAmount,
    rateLimitStart,
    toNumber,
    translateMembershipError,
    USAGE_HOUR_FORMAT
} from '../membership-utils'
import {
    MembershipWithPlan,
    NumericRaw,
    RecordGatewayUsageInput,
    RecordGatewayUsageResult,
    RecordUsageInput
} from '../membership.types'
import { UserMembership } from '../user-membership.entity'

@Injectable()
export class MembershipBillingService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly access: MembershipAccessService,
        private readonly records: MembershipRecordsService,
        private readonly lifecycle: MembershipLifecycleService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        @InjectRepository(MembershipPointLedger)
        private readonly ledgerRepository: Repository<MembershipPointLedger>
    ) {}

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
        if (modelAccess?.accessSource === ModelAccessSourceEnum.Direct) {
            return
        }
        if (
            !(await this.policy.isMembershipAccessEnabled({
                tenantId: input.tenantId,
                organizationId: input.organizationId
            }))
        ) {
            return
        }
        const access = await this.access.findModelAccessWithOrganizationSelfHeal({
            tenantId: input.tenantId,
            organizationId: input.organizationId,
            copilotOrganizationId: input.copilotOrganizationId,
            userId: modelAccess?.billableUserId ?? input.userId,
            xpertId: modelAccess ? undefined : input.xpertId
        })
        if (!access) {
            throw new ExceedingLimitException(
                translateMembershipError(
                    'server-ai:Error.MembershipPlanRequired',
                    'Membership plan is required to use Copilot models.'
                )
            )
        }
        if (modelAccess?.accessSource !== ModelAccessSourceEnum.Grant) {
            assertCopilotScopeMatches(access, input.copilotOrganizationId)
            assertModelAllowed(
                access.membership.plan,
                input.provider,
                input.model,
                modelAccess?.copilotId ?? input.copilotId,
                modelAccess?.modelType
            )
        }

        const pointsRemaining = getMembershipPointsRemaining(access.membership)
        if (pointsRemaining !== null && pointsRemaining <= 0) {
            const personalPointsBalance = await this.records.getPersonalPointsBalance(
                input.tenantId,
                access.membership.userId
            )
            if (personalPointsBalance <= 0) {
                throw new ExceedingLimitException(
                    translateMembershipError(
                        'server-ai:Error.MembershipPointsLimitExceeded',
                        'Membership points limit exceeded.'
                    )
                )
            }
        }
        await this.assertRateLimits(
            access.membership,
            modelAccess?.accessSource === ModelAccessSourceEnum.Grant ? undefined : input.provider,
            modelAccess?.accessSource === ModelAccessSourceEnum.Grant ? undefined : input.model
        )
    }

    async recordUsage(input: RecordUsageInput): Promise<MembershipPointLedger | null> {
        const tokenUsed = Math.max(0, Math.trunc(input.tokenUsed ?? 0))
        const settlementAmount = nonNegativeBillingAmount(input.settlementAmount)
        if (!settlementAmount) {
            return null
        }
        if (input.modelAccess?.accessSource === ModelAccessSourceEnum.Direct) {
            return null
        }
        if (
            !(await this.policy.isMembershipAccessEnabled({
                tenantId: input.tenantId,
                organizationId: input.organizationId
            }))
        ) {
            return null
        }
        const cnyPerPoint = await this.records.resolveTenantCnyPerPoint(input.tenantId)
        let exceeded = false
        const ledger = await this.dataSource.transaction(async (manager) => {
            if (input.sourceReference) {
                await acquireUsageSourceLock(manager, input.tenantId, input.sourceReference)
                const existing = await manager.getRepository(MembershipPointLedger).findOne({
                    where: {
                        tenantId: input.tenantId,
                        sourceReference: input.sourceReference
                    }
                })
                if (existing) {
                    exceeded = Number(existing.excessPoints ?? 0) > 0
                    return existing
                }
            }
            const access = await this.access.findModelAccessWithOrganizationSelfHeal(
                {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    copilotOrganizationId: input.copilotOrganizationId,
                    userId: input.modelAccess?.billableUserId ?? input.userId,
                    xpertId: input.modelAccess ? undefined : input.xpertId
                },
                manager,
                true
            )
            if (!access) {
                throw new ExceedingLimitException(
                    translateMembershipError(
                        'server-ai:Error.MembershipPlanRequired',
                        'Membership plan is required to use Copilot models.'
                    )
                )
            }
            if (input.modelAccess?.accessSource !== ModelAccessSourceEnum.Grant) {
                assertCopilotScopeMatches(access, input.copilotOrganizationId)
                assertModelAllowed(
                    access.membership.plan,
                    input.provider,
                    input.model,
                    input.copilotId,
                    input.modelAccess?.modelType
                )
            }

            const { membership, organizationId } = access
            const billableUserId = membership.userId
            const settlementMultiplier =
                input.modelAccess?.multiplier ?? resolveModelMultiplier(membership.plan, input.provider, input.model)
            const billableSettlementAmount = applySettlementMultiplier(settlementAmount, settlementMultiplier)
            const pointsUsed = calculatePointsFromCny(billableSettlementAmount, cnyPerPoint)
            const accessSource = input.modelAccess?.accessSource ?? ModelAccessSourceEnum.Plan
            const modelGrantId = input.modelAccess?.grantId ?? null
            const billingFields = billingLedgerFields(input, billableSettlementAmount)
            if (access.personalPointsOnly) {
                const personalPointsBalance = await this.records.getPersonalPointsBalance(
                    input.tenantId,
                    billableUserId,
                    manager
                )
                const personalPointsUsed = Math.min(pointsUsed, personalPointsBalance)
                exceeded = personalPointsUsed < pointsUsed
                return this.records.createLedger(manager, {
                    tenantId: input.tenantId,
                    userId: billableUserId,
                    membershipId: null,
                    planId: membership.planId,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: -personalPointsUsed,
                    tokenUsed,
                    provider: input.provider,
                    model: input.model,
                    organizationId,
                    runtimeOrganizationId: input.organizationId,
                    xpertId: input.xpertId,
                    threadId: input.threadId,
                    copilotId: input.copilotId,
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                    accessSource,
                    modelGrantId,
                    sourceReference: input.sourceReference,
                    chargedPoints: personalPointsUsed,
                    excessPoints: Math.max(0, pointsUsed - personalPointsUsed),
                    ...billingFields
                })
            }
            const membershipPointsRemaining = getMembershipPointsRemaining(membership)
            const membershipPointsUsed =
                membershipPointsRemaining === null ? pointsUsed : Math.min(pointsUsed, membershipPointsRemaining)
            let personalPointsUsed = pointsUsed - membershipPointsUsed

            if (personalPointsUsed > 0) {
                await acquirePersonalPointsLock(manager, input.tenantId, billableUserId)
                const personalPointsBalance = await this.records.getPersonalPointsBalance(
                    input.tenantId,
                    billableUserId,
                    manager
                )
                personalPointsUsed = Math.min(personalPointsUsed, personalPointsBalance)
                exceeded = membershipPointsUsed + personalPointsUsed < pointsUsed
            }

            membership.pointsUsed = (membership.pointsUsed ?? 0) + membershipPointsUsed
            const saved = await manager.getRepository(UserMembership).save(membership)
            await this.lifecycle.synchronizeCurrentPeriodProjection(hydrateMembershipPlanSnapshot(saved), manager)
            const ledger = await this.records.createLedger(manager, {
                tenantId: input.tenantId,
                userId: billableUserId,
                membershipId: saved.id,
                planId: saved.planId,
                source: MembershipLedgerSourceEnum.Usage,
                pointsDelta: -membershipPointsUsed,
                tokenUsed,
                provider: input.provider,
                model: input.model,
                organizationId,
                runtimeOrganizationId: input.organizationId,
                xpertId: input.xpertId,
                threadId: input.threadId,
                copilotId: input.copilotId,
                usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                accessSource,
                modelGrantId,
                sourceReference: input.sourceReference,
                chargedPoints: membershipPointsUsed,
                excessPoints: Math.max(0, pointsUsed - membershipPointsUsed - personalPointsUsed),
                ...billingFields,
                settlementAmount: cnyFromPoints(membershipPointsUsed, cnyPerPoint)
            })

            if (personalPointsUsed > 0) {
                await this.records.createLedger(manager, {
                    tenantId: input.tenantId,
                    userId: billableUserId,
                    membershipId: null,
                    planId: null,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: -personalPointsUsed,
                    tokenUsed: 0,
                    provider: input.provider,
                    model: input.model,
                    organizationId,
                    runtimeOrganizationId: input.organizationId,
                    xpertId: input.xpertId,
                    threadId: input.threadId,
                    copilotId: input.copilotId,
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                    accessSource,
                    modelGrantId,
                    sourceReference: input.sourceReference ? `${input.sourceReference}:personal` : null,
                    chargedPoints: personalPointsUsed,
                    excessPoints: 0,
                    settlementCurrency: input.settlementCurrency ?? 'CNY',
                    settlementAmount: cnyFromPoints(personalPointsUsed, cnyPerPoint),
                    exchangeRate: input.exchangeRate
                })
            }

            if (saved.pointsGranted !== null && saved.pointsUsed > saved.pointsGranted) {
                exceeded = true
            }

            return ledger
        })

        if (exceeded) {
            throw new ExceedingLimitException(
                translateMembershipError(
                    'server-ai:Error.MembershipPointsLimitExceeded',
                    'Membership points limit exceeded.'
                )
            )
        }

        return ledger
    }

    async recordGatewayUsage(input: RecordGatewayUsageInput): Promise<RecordGatewayUsageResult> {
        const tokenUsed = Math.max(0, Math.trunc(input.tokenUsed ?? 0))
        const settlementAmount = nonNegativeBillingAmount(input.settlementAmount)
        if (!settlementAmount) {
            return { chargedPoints: 0, excessPoints: 0, ledger: null }
        }
        const sourceReference = `model-gateway:${input.gatewayRequestId}`
        const cnyPerPoint = await this.records.resolveTenantCnyPerPoint(input.tenantId)

        return this.dataSource.transaction(async (manager) => {
            await acquireGatewayRequestLock(manager, input.tenantId, input.gatewayRequestId)
            const existing = await manager.getRepository(MembershipPointLedger).find({
                where: {
                    tenantId: input.tenantId,
                    gatewayRequestId: input.gatewayRequestId
                },
                order: { createdAt: 'ASC' }
            })
            if (existing.length) {
                const chargedPoints = existing.reduce(
                    (total, item) =>
                        total +
                        Math.max(
                            0,
                            Number(
                                item.chargedPoints === null || item.chargedPoints === undefined
                                    ? -item.pointsDelta
                                    : item.chargedPoints
                            )
                        ),
                    0
                )
                return {
                    chargedPoints,
                    excessPoints: Math.max(...existing.map((item) => Number(item.excessPoints ?? 0)), 0),
                    ledger: existing[0]
                }
            }

            const access = await this.access.findModelAccessWithOrganizationSelfHeal(
                {
                    tenantId: input.tenantId,
                    organizationId: input.organizationId,
                    copilotOrganizationId: input.copilotOrganizationId,
                    userId: input.modelAccess.billableUserId,
                    xpertId: undefined
                },
                manager,
                true
            )
            const billableSettlementAmount = applySettlementMultiplier(settlementAmount, input.modelAccess.multiplier)
            const pointsUsed = calculatePointsFromCny(billableSettlementAmount, cnyPerPoint)
            const billingFields = billingLedgerFields(input, billableSettlementAmount)
            if (!access) {
                const ledger = await this.records.createLedger(manager, {
                    tenantId: input.tenantId,
                    userId: input.modelAccess.billableUserId,
                    membershipId: null,
                    planId: null,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: 0,
                    tokenUsed,
                    provider: input.provider,
                    model: input.model,
                    organizationId: null,
                    runtimeOrganizationId: null,
                    copilotId: input.copilotId,
                    usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                    sourceReference,
                    accessSource: ModelAccessSourceEnum.Grant,
                    modelGrantId: input.modelAccess.grantId,
                    usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                    gatewayRequestId: input.gatewayRequestId,
                    gatewayApiKeyId: input.gatewayApiKeyId,
                    chargedPoints: 0,
                    excessPoints: pointsUsed,
                    ...billingFields
                })
                return { chargedPoints: 0, excessPoints: pointsUsed, ledger }
            }

            const { membership, organizationId } = access
            const billableUserId = membership.userId
            let membershipPointsUsed = 0
            let personalPointsUsed = 0

            if (access.personalPointsOnly) {
                await acquirePersonalPointsLock(manager, input.tenantId, billableUserId)
                const personalBalance = await this.records.getPersonalPointsBalance(
                    input.tenantId,
                    billableUserId,
                    manager
                )
                personalPointsUsed = Math.min(pointsUsed, personalBalance)
            } else {
                const membershipPointsRemaining = getMembershipPointsRemaining(membership)
                membershipPointsUsed =
                    membershipPointsRemaining === null ? pointsUsed : Math.min(pointsUsed, membershipPointsRemaining)
                const remaining = pointsUsed - membershipPointsUsed
                if (remaining > 0) {
                    await acquirePersonalPointsLock(manager, input.tenantId, billableUserId)
                    const personalBalance = await this.records.getPersonalPointsBalance(
                        input.tenantId,
                        billableUserId,
                        manager
                    )
                    personalPointsUsed = Math.min(remaining, personalBalance)
                }
                membership.pointsUsed = (membership.pointsUsed ?? 0) + membershipPointsUsed
                const saved = await manager.getRepository(UserMembership).save(membership)
                await this.lifecycle.synchronizeCurrentPeriodProjection(hydrateMembershipPlanSnapshot(saved), manager)
            }

            const chargedPoints = membershipPointsUsed + personalPointsUsed
            const excessPoints = Math.max(0, pointsUsed - chargedPoints)
            const common = {
                tenantId: input.tenantId,
                userId: billableUserId,
                provider: input.provider,
                model: input.model,
                organizationId,
                runtimeOrganizationId: null,
                copilotId: input.copilotId,
                usageHour: input.usageHour ?? formatInUTC0(new Date(), USAGE_HOUR_FORMAT),
                accessSource: ModelAccessSourceEnum.Grant,
                modelGrantId: input.modelAccess.grantId,
                usageChannel: ModelGatewayUsageChannelEnum.ExternalApi,
                gatewayRequestId: input.gatewayRequestId,
                gatewayApiKeyId: input.gatewayApiKeyId,
                excessPoints,
                settlementCurrency: input.settlementCurrency ?? 'CNY',
                exchangeRate: input.exchangeRate
            }
            const ledger = await this.records.createLedger(manager, {
                ...common,
                membershipId: access.personalPointsOnly ? null : membership.id,
                planId: membership.planId,
                source: access.personalPointsOnly
                    ? MembershipLedgerSourceEnum.PersonalUsage
                    : MembershipLedgerSourceEnum.Usage,
                pointsDelta: -(access.personalPointsOnly ? personalPointsUsed : membershipPointsUsed),
                tokenUsed,
                chargedPoints: access.personalPointsOnly ? personalPointsUsed : membershipPointsUsed,
                sourceReference,
                priceAmount: input.priceAmount,
                priceCurrency: input.priceCurrency,
                settlementAmount: cnyFromPoints(
                    access.personalPointsOnly ? personalPointsUsed : membershipPointsUsed,
                    cnyPerPoint
                )
            })
            if (personalPointsUsed > 0 && !access.personalPointsOnly) {
                await this.records.createLedger(manager, {
                    ...common,
                    membershipId: null,
                    planId: null,
                    source: MembershipLedgerSourceEnum.PersonalUsage,
                    pointsDelta: -personalPointsUsed,
                    tokenUsed: 0,
                    chargedPoints: personalPointsUsed,
                    excessPoints: 0,
                    sourceReference: `${sourceReference}:personal`,
                    settlementAmount: cnyFromPoints(personalPointsUsed, cnyPerPoint)
                })
            }
            return { chargedPoints, excessPoints, ledger }
        })
    }

    async assertRateLimits(membership: MembershipWithPlan, provider?: string, model?: string) {
        const limits = (membership.plan.rateLimits ?? []).filter((limit) => {
            const providerMatches = !limit.provider || limit.provider === provider
            const modelMatches = !limit.model || limit.model === model || limit.model === '*'
            return providerMatches && modelMatches
        })

        for (const limit of limits) {
            const start = rateLimitStart(limit.period, membership.currentPeriodStart)
            const qb = this.ledgerRepository
                .createQueryBuilder('ledger')
                .select('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .where('ledger.tenantId = :tenantId', { tenantId: membership.tenantId })
                .andWhere('ledger.userId = :userId', { userId: membership.userId })
                .andWhere('ledger.source IN (:...sources)', {
                    sources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
                })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere(limit.provider ? 'ledger.provider = :provider' : '1=1', { provider: limit.provider })
                .andWhere(limit.model && limit.model !== '*' ? 'ledger.model = :model' : '1=1', { model: limit.model })
            applyScopeFilter(qb, 'ledger.organizationId', membership.organizationId ?? null)
            const row = await qb.getRawOne<NumericRaw>()
            if (toNumber(row?.pointsUsed) >= limit.pointLimit) {
                throw new ExceedingLimitException('Membership rate limit exceeded.')
            }
        }
    }
}
