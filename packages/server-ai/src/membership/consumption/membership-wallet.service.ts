import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
    MembershipLedgerSourceEnum,
    TMembershipPersonalPointsAdjustmentInput,
    TMembershipPointAdjustInput
} from '@xpert-ai/contracts'
import { DataSource, EntityManager } from 'typeorm'
import { acquirePersonalPointsLock, acquirePersonalPointsSourceLock } from '../membership-locks'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { MembershipPolicyService } from '../members/membership-policy.service'
import { MembershipRecordsService } from '../members/membership-records.service'
import { requireCurrentScope, requireNonZeroPointDelta, translateMembershipError } from '../membership-utils'

@Injectable()
export class MembershipWalletService {
    constructor(
        private readonly policy: MembershipPolicyService,
        private readonly records: MembershipRecordsService,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async getPersonalPoints(userId: string) {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        await this.policy.assertMembershipEligibleUser(scope.tenantId, userId)
        return {
            userId,
            balance: await this.records.getPersonalPointsBalance(scope.tenantId, userId)
        }
    }

    async adjustPersonalPoints(userId: string, input: TMembershipPointAdjustInput) {
        const scope = requireCurrentScope()
        await this.policy.assertMembershipPlanFeatureEnabled(scope)
        if (scope.organizationId) {
            throw new ForbiddenException(
                translateMembershipError(
                    'server-ai:Error.PersonalPointsTenantOnly',
                    'Personal points can only be managed in tenant scope.'
                )
            )
        }
        await this.policy.assertMembershipEligibleUser(scope.tenantId, userId)
        const pointDelta = requireNonZeroPointDelta(input.pointDelta)

        return this.dataSource.transaction(async (manager) => {
            await acquirePersonalPointsLock(manager, scope.tenantId, userId)
            const balance = await this.records.getPersonalPointsBalance(scope.tenantId, userId, manager)
            if (balance + pointDelta < 0) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.InsufficientPersonalPoints',
                        'Personal points balance cannot be negative.'
                    )
                )
            }
            await this.records.createLedger(manager, {
                tenantId: scope.tenantId,
                userId,
                membershipId: null,
                planId: null,
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                pointsDelta: pointDelta,
                reason: input.reason ?? null
            })
            return { userId, balance: balance + pointDelta }
        })
    }

    async applyPersonalPointsAdjustment(input: TMembershipPersonalPointsAdjustmentInput, manager?: EntityManager) {
        const sourceReference = input.sourceReference?.trim()
        if (!sourceReference || sourceReference.length > 191) {
            throw new BadRequestException(
                translateMembershipError(
                    'server-ai:Error.InvalidPersonalPointsSourceReference',
                    'Personal points adjustment source reference must be between 1 and 191 characters.'
                )
            )
        }
        const pointDelta = requireNonZeroPointDelta(input.pointDelta)
        await this.policy.assertMembershipEligibleUser(input.tenantId, input.userId)

        const apply = async (txManager: EntityManager) => {
            await acquirePersonalPointsSourceLock(txManager, input.tenantId, sourceReference)
            await acquirePersonalPointsLock(txManager, input.tenantId, input.userId)

            const ledgerRepository = txManager.getRepository(MembershipPointLedger)
            const existing = await ledgerRepository.findOne({
                where: {
                    tenantId: input.tenantId,
                    sourceReference
                }
            })
            if (existing) {
                if (
                    existing.userId !== input.userId ||
                    (existing.membershipId !== null && existing.membershipId !== undefined) ||
                    (existing.planId !== null && existing.planId !== undefined) ||
                    existing.source !== MembershipLedgerSourceEnum.PersonalAdjustment ||
                    Number(existing.pointsDelta) !== pointDelta
                ) {
                    throw new BadRequestException(
                        translateMembershipError(
                            'server-ai:Error.PersonalPointsAdjustmentMismatch',
                            'Personal points adjustment does not match the existing fulfillment.'
                        )
                    )
                }
                return {
                    userId: input.userId,
                    balance: await this.records.getPersonalPointsBalance(input.tenantId, input.userId, txManager)
                }
            }

            const balance = await this.records.getPersonalPointsBalance(input.tenantId, input.userId, txManager)
            if (balance + pointDelta < 0) {
                throw new BadRequestException(
                    translateMembershipError(
                        'server-ai:Error.InsufficientPersonalPoints',
                        'Personal points balance cannot be negative.'
                    )
                )
            }
            await this.records.createLedger(txManager, {
                tenantId: input.tenantId,
                userId: input.userId,
                membershipId: null,
                planId: null,
                source: MembershipLedgerSourceEnum.PersonalAdjustment,
                sourceReference,
                actorId: input.actorId,
                pointsDelta: pointDelta,
                reason: input.reason ?? null
            })
            return { userId: input.userId, balance: balance + pointDelta }
        }

        return manager ? apply(manager) : this.dataSource.transaction(apply)
    }
}
