import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
    MembershipLedgerSourceEnum,
    MembershipPeriodStatusEnum,
    MembershipSourceEnum,
    TMembershipPeriodCancelInput,
    TMembershipPeriodsRefundReservationInput
} from '@xpert-ai/contracts'
import { DataSource, EntityManager, In } from 'typeorm'
import { acquireMembershipAssignmentLock } from '../membership-locks'
import { MembershipPeriod } from '../membership-period.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import {
    applyScopeFilter,
    normalizeScopeOrganizationId,
    requireCurrentScope,
    scopeWhere,
    translateMembershipError
} from '../membership-utils'

@Injectable()
export class MembershipRefundsService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async cancelAdminUserPeriod(userId: string, periodId: string): Promise<MembershipPeriod> {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        return this.cancelScheduledMembershipPeriod({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId,
            periodId
        })
    }

    async cancelScheduledMembershipPeriod(
        input: TMembershipPeriodCancelInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod> {
        const cancel = async (txManager: EntityManager) => {
            const organizationId = normalizeScopeOrganizationId(input.organizationId)
            await acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const repository = txManager.getRepository(MembershipPeriod)
            const period = await repository.findOne({
                where: {
                    ...scopeWhere(input.tenantId, organizationId),
                    id: input.periodId,
                    userId: input.userId
                }
            })
            if (!period) {
                throw new BadRequestException(
                    translateMembershipError('server-ai:Error.MembershipPeriodNotFound', 'Membership period not found.')
                )
            }
            if (period.status !== MembershipPeriodStatusEnum.Scheduled) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipPeriodNotScheduled',
                        'Only a scheduled membership period can be cancelled.'
                    )
                )
            }
            const lastScheduledPeriod = await repository.findOne({
                where: {
                    tenantId: input.tenantId,
                    membershipId: period.membershipId,
                    status: In([MembershipPeriodStatusEnum.Scheduled, MembershipPeriodStatusEnum.RefundPending])
                },
                order: { periodEnd: 'DESC' }
            })
            if (lastScheduledPeriod?.id !== period.id) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipPeriodCancellationOrder',
                        'Only the last scheduled membership period can be cancelled.'
                    )
                )
            }

            const expectedSourceReference = period.sourceReference?.trim() || null
            const sourceReference = input.sourceReference?.trim() || null
            const isExternallyManaged = period.source === MembershipSourceEnum.External || !!expectedSourceReference
            if (
                isExternallyManaged &&
                (!expectedSourceReference || !sourceReference || sourceReference !== expectedSourceReference)
            ) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.ExternalMembershipPeriodCancellationRequired',
                        'Externally managed periods must be refunded and cancelled by the external billing system.'
                    )
                )
            }

            period.status = MembershipPeriodStatusEnum.Cancelled
            const cancelled = await repository.save(period)
            await this.records.createLedger(txManager, {
                tenantId: period.tenantId,
                organizationId: period.organizationId ?? null,
                userId: period.userId,
                membershipId: period.membershipId,
                planId: period.planId,
                source: MembershipLedgerSourceEnum.StatusChange,
                pointsDelta: 0,
                reason: 'Scheduled membership period cancelled'
            })
            return cancelled
        }

        return manager ? cancel(manager) : this.dataSource.transaction(cancel)
    }

    async reserveFutureMembershipPeriodsForRefund(
        input: TMembershipPeriodsRefundReservationInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        const reserve = async (txManager: EntityManager) => {
            const organizationId = normalizeScopeOrganizationId(input.organizationId)
            const sourceReference = input.sourceReference.trim()
            if (!sourceReference) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipRefundSourceReferenceRequired',
                        'Membership refund source reference is required.'
                    )
                )
            }

            await acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const repository = txManager.getRepository(MembershipPeriod)
            const sourcePeriodsQuery = repository
                .createQueryBuilder('period')
                .where('period.tenantId = :tenantId', { tenantId: input.tenantId })
                .andWhere('period.userId = :userId', { userId: input.userId })
                .andWhere('period.sourceReference = :sourceReference', { sourceReference })
                .orderBy('period.periodStart', 'ASC')
                .setLock('pessimistic_write', undefined, ['period'])
            applyScopeFilter(sourcePeriodsQuery, 'period.organizationId', organizationId)
            const sourcePeriods = await sourcePeriodsQuery.getMany()
            if (!sourcePeriods.length) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipRefundOrderPeriodsNotFound',
                        'Membership periods for this payment order were not found.'
                    )
                )
            }

            const refundPending = sourcePeriods.filter(
                ({ status }) => status === MembershipPeriodStatusEnum.RefundPending
            )
            if (refundPending.length) {
                return refundPending
            }

            const now = Date.now()
            const refundable = sourcePeriods.filter(
                (period) =>
                    period.status === MembershipPeriodStatusEnum.Scheduled &&
                    new Date(period.periodStart).getTime() > now
            )
            if (!refundable.length) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipRefundNoFuturePeriods',
                        'This payment order has no unstarted membership periods to refund.'
                    )
                )
            }

            const membershipId = refundable[0].membershipId
            if (refundable.some((period) => period.membershipId !== membershipId)) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipRefundMixedMemberships',
                        'Membership refund periods must belong to the same membership.'
                    )
                )
            }
            const tailQuery = repository
                .createQueryBuilder('period')
                .where('period.tenantId = :tenantId', { tenantId: input.tenantId })
                .andWhere('period.membershipId = :membershipId', { membershipId })
                .andWhere('period.status IN (:...statuses)', {
                    statuses: [MembershipPeriodStatusEnum.Scheduled, MembershipPeriodStatusEnum.RefundPending]
                })
                .orderBy('period.periodStart', 'ASC')
                .setLock('pessimistic_write', undefined, ['period'])
            applyScopeFilter(tailQuery, 'period.organizationId', organizationId)
            const tailCandidates = await tailQuery.getMany()
            const expectedTailIds = tailCandidates.slice(-refundable.length).map(({ id }) => id)
            const refundableIds = refundable.map(({ id }) => id)
            if (
                expectedTailIds.length !== refundableIds.length ||
                expectedTailIds.some((id, index) => id !== refundableIds[index])
            ) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipRefundTailRequired',
                        'Only a contiguous tail of unstarted membership periods can be refunded.'
                    )
                )
            }

            refundable.forEach((period) => {
                period.status = MembershipPeriodStatusEnum.RefundPending
            })
            return repository.save(refundable)
        }

        return manager ? reserve(manager) : this.dataSource.transaction(reserve)
    }

    async finalizeFutureMembershipPeriodsRefund(
        input: TMembershipPeriodsRefundReservationInput,
        manager?: EntityManager
    ): Promise<MembershipPeriod[]> {
        const finalize = async (txManager: EntityManager) => {
            const organizationId = normalizeScopeOrganizationId(input.organizationId)
            const sourceReference = input.sourceReference.trim()
            await acquireMembershipAssignmentLock(txManager, input.tenantId, organizationId, input.userId)
            const repository = txManager.getRepository(MembershipPeriod)
            const query = repository
                .createQueryBuilder('period')
                .where('period.tenantId = :tenantId', { tenantId: input.tenantId })
                .andWhere('period.userId = :userId', { userId: input.userId })
                .andWhere('period.sourceReference = :sourceReference', { sourceReference })
                .andWhere('period.status = :status', { status: MembershipPeriodStatusEnum.RefundPending })
                .orderBy('period.periodStart', 'DESC')
                .setLock('pessimistic_write', undefined, ['period'])
            applyScopeFilter(query, 'period.organizationId', organizationId)
            const reserved = await query.getMany()
            if (!reserved.length) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.MembershipRefundReservationNotFound',
                        'No membership periods are reserved for this refund.'
                    )
                )
            }

            reserved.forEach((period) => {
                period.status = MembershipPeriodStatusEnum.Cancelled
            })
            const cancelled = await repository.save(reserved)
            await this.records.createLedger(txManager, {
                tenantId: input.tenantId,
                organizationId,
                userId: input.userId,
                membershipId: reserved[0].membershipId,
                planId: reserved[0].planId,
                source: MembershipLedgerSourceEnum.StatusChange,
                pointsDelta: 0,
                reason: `${reserved.length} future membership period${reserved.length === 1 ? '' : 's'} refunded`
            })
            return cancelled
        }

        return manager ? finalize(manager) : this.dataSource.transaction(finalize)
    }
}
