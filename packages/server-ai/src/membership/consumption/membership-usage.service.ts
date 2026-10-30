import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    IMembershipMe,
    IMembershipUsageOverview,
    IMembershipUsageQuery,
    IMembershipUsageSummary,
    IPagination,
    MembershipLedgerSourceEnum
} from '@xpert-ai/contracts'
import { TenantSetting } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { MembershipAccessService } from './membership-access.service'
import { MembershipPointLedger } from '../membership-point-ledger.entity'
import { MembershipRecordsService } from '../members/membership-records.service'
import { createMembershipUsageQuery, readPeriodConsumedPoints, USAGE_POINTS_SQL } from '../membership-usage-points'
import {
    applyLedgerFilters,
    applyMembershipUsageLedgerFilter,
    formatDateKey,
    requireCurrentScope,
    requireUser,
    resolveDateRange,
    toMembershipMe,
    toNumber,
    toUsageSummary
} from '../membership-utils'
import { MembershipUsageSummaryRaw, NumericRaw } from '../membership.types'

@Injectable()
export class MembershipUsageService {
    constructor(
        private readonly access: MembershipAccessService,
        private readonly records: MembershipRecordsService,
        @InjectRepository(MembershipPointLedger)
        private readonly ledgerRepository: Repository<MembershipPointLedger>,
        @Optional()
        @InjectRepository(TenantSetting)
        private readonly tenantSettingRepository?: Repository<TenantSetting>
    ) {}

    async getMe(): Promise<IMembershipMe | null> {
        const { tenantId, organizationId } = requireCurrentScope()
        const access = await this.access.findMembershipPresentationAccess(tenantId, organizationId, requireUser())
        if (!access) {
            return null
        }
        const personalPointsBalance = await this.records.getPersonalPointsBalance(tenantId, access.membership.userId)
        const membership = access.persistedMembership ?? access.membership
        return {
            ...toMembershipMe(membership, personalPointsBalance, !!access.personalPointsOnly),
            consumedPoints: await readPeriodConsumedPoints(this.ledgerRepository, this.tenantSettingRepository, {
                tenantId,
                userId: membership.userId,
                currentPeriodStart: membership.currentPeriodStart,
                currentPeriodEnd: membership.currentPeriodEnd
            })
        }
    }

    async getOverview(query?: IMembershipUsageQuery): Promise<IMembershipUsageOverview> {
        const { tenantId, organizationId } = requireCurrentScope()
        const userId = requireUser()
        const access = await this.access.findMembershipPresentationAccess(tenantId, organizationId, userId)
        const membership = access?.persistedMembership ?? access?.membership
        const base = membership
            ? {
                  ...toMembershipMe(
                      membership,
                      await this.records.getPersonalPointsBalance(tenantId, userId),
                      !!access.personalPointsOnly
                  ),
                  consumedPoints: await readPeriodConsumedPoints(this.ledgerRepository, this.tenantSettingRepository, {
                      tenantId,
                      userId: membership.userId,
                      currentPeriodStart: membership.currentPeriodStart,
                      currentPeriodEnd: membership.currentPeriodEnd
                  })
              }
            : {}
        const { start, end } = resolveDateRange(query)

        const dailyRows = await applyLedgerFilters(
            createMembershipUsageQuery(
                this.ledgerRepository,
                { tenantId, userId },
                await this.records.resolveTenantCnyPerPoint(tenantId)
            )
                .select("DATE_TRUNC('day', ledger.createdAt)", 'day')
                .addSelect(`COALESCE(SUM(${USAGE_POINTS_SQL}), 0)`, 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .groupBy("DATE_TRUNC('day', ledger.createdAt)")
                .orderBy("DATE_TRUNC('day', ledger.createdAt)", 'ASC'),
            query
        ).getRawMany<NumericRaw & { day?: Date | string }>()

        const buckets = dailyRows.map((row) => ({
            date: formatDateKey(new Date(row.day as string)),
            pointsUsed: toNumber(row.pointsUsed),
            tokenUsed: toNumber(row.tokenUsed)
        }))

        const [topModels, topXperts, topThreads] = await Promise.all([
            this.findTopLedgerRanks(tenantId, userId, 'model', query, start, end),
            this.findTopLedgerRanks(tenantId, userId, 'xpertId', query, start, end),
            this.findTopLedgerRanks(tenantId, userId, 'threadId', query, start, end)
        ])

        const totalTokens = buckets.reduce((sum, item) => sum + item.tokenUsed, 0)
        const peakDailyTokens = buckets.reduce((max, item) => Math.max(max, item.tokenUsed), 0)

        return {
            ...base,
            totalTokens,
            peakDailyTokens,
            activeDays: buckets.filter((item) => item.tokenUsed > 0).length,
            buckets,
            topModels,
            topXperts,
            topThreads
        }
    }

    async findMyUsage(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<MembershipPointLedger>> {
        const { tenantId } = requireCurrentScope()
        const userId = requireUser()
        return this.findUserUsage(tenantId, userId, query, options)
    }

    async findMyUsageSummaries(
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<IMembershipUsageSummary>> {
        const { tenantId } = requireCurrentScope()
        const userId = requireUser()
        return this.findUserUsageSummaries(tenantId, userId, query, options)
    }

    async findUserUsageSummaries(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number },
        membershipId?: string,
        organizationId?: string | null
    ): Promise<IPagination<IMembershipUsageSummary>> {
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const { start, end } = resolveDateRange(query)
        const qb = applyLedgerFilters(
            this.ledgerRepository
                .createQueryBuilder('ledger')
                .select('ledger.usageHour', 'usageHour')
                .addSelect('ledger.usageChannel', 'usageChannel')
                .addSelect('ledger.provider', 'provider')
                .addSelect('ledger.model', 'model')
                .addSelect('ledger.organizationId', 'organizationId')
                .addSelect('ledger.xpertId', 'xpertId')
                .addSelect('ledger.threadId', 'threadId')
                .addSelect('ledger.copilotId', 'copilotId')
                .addSelect('MAX(conversation.title)', 'conversationTitle')
                .addSelect('MAX(usage_xpert.title)', 'xpertTitle')
                .addSelect('MAX(usage_xpert.name)', 'xpertName')
                .addSelect('COUNT(ledger.id) FILTER (WHERE COALESCE(ledger.tokenUsed, 0) > 0)', 'callCount')
                .addSelect('COALESCE(SUM(ledger.pointsDelta), 0)', 'pointsDelta')
                .addSelect('COALESCE(SUM(ABS(ledger.pointsDelta)), 0)', 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .addSelect('MIN(ledger.createdAt)', 'firstUsedAt')
                .addSelect('MAX(ledger.createdAt)', 'lastUsedAt')
                .addSelect('COUNT(*) OVER()', 'total')
                .leftJoin(
                    'chat_conversation',
                    'conversation',
                    `"conversation"."tenantId" = ledger."tenantId" AND "conversation"."threadId" = ledger."threadId"`
                )
                .leftJoin(
                    'xpert',
                    'usage_xpert',
                    `"usage_xpert"."tenantId" = ledger."tenantId" AND "usage_xpert"."id"::text = ledger."xpertId"`
                )
                .where('ledger.tenantId = :tenantId', { tenantId })
                .andWhere('ledger.userId = :userId', { userId })
                .andWhere('ledger.source IN (:...usageSources)', {
                    usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
                })
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .groupBy('ledger.usageHour')
                .addGroupBy('ledger.usageChannel')
                .addGroupBy('ledger.provider')
                .addGroupBy('ledger.model')
                .addGroupBy('ledger.organizationId')
                .addGroupBy('ledger.xpertId')
                .addGroupBy('ledger.threadId')
                .addGroupBy('ledger.copilotId')
                .orderBy('MAX(ledger.createdAt)', 'DESC')
                .take(take)
                .skip(skip),
            query
        )

        if (membershipId) {
            applyMembershipUsageLedgerFilter(qb, membershipId, organizationId ?? null)
        }

        const rows = await qb.getRawMany<MembershipUsageSummaryRaw>()
        return {
            items: rows.map((row) => toUsageSummary(row)),
            total: rows.length ? toNumber(rows[0].total) : 0
        }
    }

    async findUserUsage(
        tenantId: string,
        userId: string,
        query?: IMembershipUsageQuery,
        options?: { take?: number; skip?: number },
        membershipId?: string,
        organizationId?: string | null
    ): Promise<IPagination<MembershipPointLedger>> {
        const take = Number(options?.take ?? 20)
        const skip = Number(options?.skip ?? 0)
        const { start, end } = resolveDateRange(query)
        const qb = this.ledgerRepository
            .createQueryBuilder('ledger')
            .leftJoinAndSelect('ledger.plan', 'plan')
            .where('ledger.tenantId = :tenantId', { tenantId })
            .andWhere('ledger.userId = :userId', { userId })
            .andWhere('ledger.source IN (:...usageSources)', {
                usageSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
            })
            .andWhere('ledger.createdAt >= :start', { start })
            .andWhere('ledger.createdAt <= :end', { end })
            .orderBy('ledger.createdAt', 'DESC')
            .take(take)
            .skip(skip)

        if (membershipId) {
            applyMembershipUsageLedgerFilter(qb, membershipId, organizationId ?? null)
        }

        applyLedgerFilters(qb, query)
        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async findTopLedgerRanks(
        tenantId: string,
        userId: string,
        dimension: 'model' | 'xpertId' | 'threadId',
        query: IMembershipUsageQuery | undefined,
        start: Date,
        end: Date
    ) {
        const qb = applyLedgerFilters(
            createMembershipUsageQuery(
                this.ledgerRepository,
                { tenantId, userId },
                await this.records.resolveTenantCnyPerPoint(tenantId)
            )
                .select(`ledger.${dimension}`, 'key')
                .addSelect(`COALESCE(SUM(${USAGE_POINTS_SQL}), 0)`, 'pointsUsed')
                .addSelect('COALESCE(SUM(ledger.tokenUsed), 0)', 'tokenUsed')
                .andWhere('ledger.createdAt >= :start', { start })
                .andWhere('ledger.createdAt <= :end', { end })
                .andWhere(`ledger.${dimension} IS NOT NULL`)
                .groupBy(`ledger.${dimension}`)
                .orderBy(`COALESCE(SUM(${USAGE_POINTS_SQL}), 0)`, 'DESC')
                .take(5),
            query
        )

        if (dimension === 'xpertId') {
            qb.leftJoin(
                'xpert',
                'rank_xpert',
                '"rank_xpert"."tenantId" = ledger."tenantId" AND "rank_xpert"."id"::text = ledger."xpertId" AND "rank_xpert"."deletedAt" IS NULL'
            ).addSelect("COALESCE(NULLIF(MAX(rank_xpert.title), ''), NULLIF(MAX(rank_xpert.name), ''))", 'label')
        } else if (dimension === 'threadId') {
            qb.leftJoin(
                'chat_conversation',
                'rank_conversation',
                '"rank_conversation"."tenantId" = ledger."tenantId" AND "rank_conversation"."threadId" = ledger."threadId"'
            ).addSelect("NULLIF(MAX(rank_conversation.title), '')", 'label')
        }

        const rows = await qb.getRawMany<NumericRaw & { key?: string; label?: string }>()
        return rows.map((row) => ({
            key: row.key,
            label: row.label?.trim() || row.key,
            pointsUsed: toNumber(row.pointsUsed),
            tokenUsed: toNumber(row.tokenUsed)
        }))
    }
}
