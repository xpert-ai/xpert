import {
    modelUsageRequestKeySql,
    modelUsageAccountKeySql,
    modelUsageBreakdownKeySql,
    pricingStatusFromRank,
    toLedgerEntry,
    requireText,
    normalizeTake,
    normalizeText,
    normalizeDate,
    normalizeTokenCount,
    normalizeOptionalTokenCount,
    normalizePriceAmount,
    displayUserName,
    USAGE_HOUR_FORMAT,
    UNKNOWN_USAGE_ACCOUNT_KEY,
    LEGACY_USAGE_SOURCES,
    LEGACY_USAGE_PREDICATE
} from './model-usage-ledger.support'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { applyExecutionUsageFilters } from './execution-usage-filters'
import type {
    IModelUsageDetails,
    IModelUsageLedger,
    IPagination,
    ModelUsageAccountSummary,
    ModelUsageBreakdownDimension,
    ModelUsageBreakdownSummary,
    ModelUsageLedgerQuery,
    ModelUsageLedgerTotals,
    ModelUsageLedgerModality,
    ModelUsageMetric,
    ModelUsagePricingSnapshot,
    ModelUsageReport,
    ModelUsageReportResult
} from '@xpert-ai/contracts'
import { MembershipLedgerSourceEnum, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { User } from '@xpert-ai/server-core'
import { randomUUID } from 'node:crypto'
import { In, type Repository } from 'typeorm'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { settleChargeToCny } from '../../membership/model-billing'
import { MembershipService } from '../../membership/membership.service'
import { formatInUTC0 } from '../../shared/utils'
import type {
    CopilotModelUsageRecordingScope,
    CopilotTokenUsageRecordingScope,
    CopilotTokenUsageReport
} from '../copilot-usage.types'
import { toUsageDetails, toUsageLedgerItem } from './model-usage-ledger.adapters'
import { createModelUsageReadQuery, readModelUsageEntries } from './model-usage-read-query'
import { normalizeModelUsageMetrics } from './model-usage.utils'

@Injectable()
export class ModelUsageLedgerService {
    constructor(
        @InjectRepository(MembershipPointLedger)
        private readonly repository: Repository<MembershipPointLedger>,
        private readonly membership: MembershipService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>
    ) {}

    async recordTokenUsage(
        scope: CopilotTokenUsageRecordingScope,
        report: CopilotTokenUsageReport
    ): Promise<ModelUsageReportResult> {
        const requestId = requireText(report.requestId, 'request ID')
        const totalTokens = normalizeTokenCount(report.totalTokens)
        if (!totalTokens) {
            return { requestId, recorded: false, ledgerIds: [] }
        }
        const recordedAt = normalizeDate(report.recordedAt) ?? new Date()
        const reportedPriceAmount = normalizePriceAmount(report.priceAmount)
        const pricingStatus =
            report.pricingStatus === 'priced' && reportedPriceAmount === undefined
                ? 'unpriced'
                : (report.pricingStatus ??
                  (reportedPriceAmount === undefined ? 'unpriced' : reportedPriceAmount === 0 ? 'free' : 'priced'))
        const priceAmount =
            pricingStatus === 'unpriced' ? undefined : pricingStatus === 'free' ? 0 : reportedPriceAmount
        const priceCurrency = normalizeText(report.priceCurrency)?.toUpperCase()
        const settlement = settleChargeToCny({ pricingStatus, amount: priceAmount, currency: priceCurrency })
        const entry = this.repository.create({
            id: randomUUID(),
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            runtimeOrganizationId: scope.organizationId,
            createdById: scope.userId,
            actorId: scope.execution?.actorUserId ?? scope.userId,
            executionContext: scope.execution ?? null,
            tokenDetails: report.tokenDetails ?? null,
            usageChannel:
                scope.execution?.entry === 'cli'
                    ? ModelGatewayUsageChannelEnum.Cli
                    : scope.execution?.entry === 'agent_runtime'
                      ? ModelGatewayUsageChannelEnum.AgentRuntime
                      : ModelGatewayUsageChannelEnum.Xpert,
            userId: scope.userId,
            source: MembershipLedgerSourceEnum.ModelUsage,
            pointsDelta: 0,
            requestId,
            revision: 1,
            originType: 'model',
            originId: normalizeText(scope.originId) ?? requestId,
            xpertId: scope.xpertId,
            copilotId: scope.copilotId,
            providerScopeId: scope.providerScopeId,
            provider: scope.provider,
            model: report.model,
            modelType: report.modelType,
            modality: 'text',
            operation: report.modelType,
            metricKey: 'token',
            unit: 'token',
            authority: 'provider',
            quantity: null,
            tokenUsed: totalTokens,
            promptTokens: normalizeOptionalTokenCount(report.promptTokens),
            completionTokens: normalizeOptionalTokenCount(report.completionTokens),
            totalTokens,
            recordedAt,
            usageHour: formatInUTC0(recordedAt, USAGE_HOUR_FORMAT),
            pricingStatus,
            pricingRuleId: null,
            pricingRuleVersion: null,
            priceQuantity: totalTokens,
            unitSize: null,
            unitPrice: null,
            priceCurrency: priceCurrency ?? null,
            priceAmount: priceAmount ?? null,
            priceAuthority: report.priceAuthority ?? null,
            pricingRule: null,
            pricingBreakdown: report.pricingBreakdown ?? null,
            chargedAt: recordedAt,
            settlementCurrency: settlement?.currency ?? null,
            settlementAmount: settlement?.amount ?? null,
            exchangeRate: settlement?.exchangeRate ?? null
        })
        const insert = await this.repository
            .createQueryBuilder()
            .insert()
            .into(MembershipPointLedger)
            .values(entry)
            .orIgnore()
            .execute()
        const entries = await this.repository.find({
            where: {
                tenantId: scope.tenantId,
                providerScopeId: scope.providerScopeId,
                requestId,
                unit: 'token',
                revision: 1
            }
        })
        for (const stored of entries) {
            if (!stored.userId || !stored.settlementAmount || stored.settlementAmount <= 0) {
                continue
            }
            await this.membership.recordUsage({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                copilotOrganizationId: scope.copilotOrganizationId,
                userId: stored.userId,
                provider: stored.provider,
                model: stored.model ?? undefined,
                tokenUsed: stored.totalTokens ?? 0,
                priceAmount: stored.priceAmount,
                priceCurrency: stored.priceCurrency,
                settlementAmount: stored.settlementAmount,
                settlementCurrency: stored.settlementCurrency,
                exchangeRate: stored.exchangeRate,
                sourceReference: `model-usage-charge:${stored.id}`,
                usageHour: stored.usageHour ?? undefined,
                xpertId: scope.xpertId,
                threadId: scope.originId ?? undefined,
                copilotId: stored.copilotId ?? undefined,
                modelAccess: scope.modelAccess
            })
        }
        return {
            requestId,
            recorded: insert.identifiers.length > 0,
            ledgerIds: entries.map((item) => item.id)
        }
    }

    async recordUsage(
        scope: CopilotModelUsageRecordingScope,
        report: ModelUsageReport,
        pricingSnapshot: ModelUsagePricingSnapshot
    ): Promise<ModelUsageReportResult> {
        const metrics = normalizeModelUsageMetrics(report.metrics)
        const requestId = requireText(report.requestId, 'request ID')
        const recordedAt = normalizeDate(report.recordedAt) ?? new Date()
        const normalizedReport = { ...report, requestId, recordedAt }

        const { inserted, entries } = await this.repository.manager.transaction(async (manager) => {
            let inserted = 0
            for (const metric of metrics) {
                const entry = manager.create(
                    MembershipPointLedger,
                    toLedgerEntry(scope, normalizedReport, metric, pricingSnapshot)
                )
                const result = await manager
                    .createQueryBuilder()
                    .insert()
                    .into(MembershipPointLedger)
                    .values(entry)
                    .orIgnore()
                    .execute()
                inserted += result.identifiers.length
            }
            const entries = await manager.find(MembershipPointLedger, {
                where: {
                    tenantId: scope.tenantId,
                    providerScopeId: scope.providerScopeId,
                    requestId,
                    revision: 1
                }
            })
            return { inserted, entries }
        })

        for (const entry of entries) {
            if (!entry.userId || !entry.settlementAmount || entry.settlementAmount <= 0) {
                continue
            }
            await this.membership.recordUsage({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                copilotOrganizationId: scope.copilotOrganizationId,
                userId: entry.userId,
                provider: entry.provider,
                model: entry.model ?? undefined,
                tokenUsed: entry.totalTokens ?? 0,
                priceAmount: entry.priceAmount,
                priceCurrency: entry.priceCurrency,
                settlementAmount: entry.settlementAmount,
                settlementCurrency: entry.settlementCurrency,
                exchangeRate: entry.exchangeRate,
                sourceReference: `model-usage-charge:${entry.id}`,
                usageHour: entry.usageHour ?? undefined,
                xpertId: scope.xpertId,
                copilotId: entry.copilotId ?? undefined,
                modelAccess: scope.modelAccess
            })
        }

        return {
            requestId,
            recorded: inserted > 0,
            ledgerIds: entries.map((entry) => entry.id)
        }
    }

    async getUsages(executionIds: string[], tenantId: string): Promise<IModelUsageDetails[]> {
        return toUsageDetails(await this.findByExecutionIds(executionIds, tenantId))
    }

    async findPage(
        query: ModelUsageLedgerQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<IModelUsageLedger>> {
        const requestKeySql = modelUsageRequestKeySql()
        const take = normalizeTake(options?.take)
        const skip = Math.max(0, Number(options?.skip) || 0)
        const [requestRows, countRow] = await Promise.all([
            this.baseQuery(query)
                .select(requestKeySql, 'requestKey')
                .addSelect('MAX(COALESCE(ledger.recordedAt, ledger.createdAt))', 'recordedAt')
                .groupBy(requestKeySql)
                .orderBy('MAX(COALESCE(ledger.recordedAt, ledger.createdAt))', 'DESC')
                .take(take)
                .skip(skip)
                .getRawMany<{ requestKey: string }>(),
            this.baseQuery(query)
                .select(`COUNT(DISTINCT ${requestKeySql})`, 'total')
                .getRawOne<{ total: string | number }>()
        ])
        const total = Number(countRow?.total) || 0
        if (!requestRows.length) return { items: [], total }
        const entriesQuery = this.baseQuery(query)
            .andWhere(`${requestKeySql} IN (:...requestKeys)`, {
                requestKeys: requestRows.map(({ requestKey }) => requestKey)
            })
            .orderBy('COALESCE(ledger.recordedAt, ledger.createdAt)', 'DESC')
        const entries = await readModelUsageEntries(entriesQuery, this.repository)
        const items = entries.map(toUsageLedgerItem).filter((entry): entry is IModelUsageLedger => entry !== null)
        return { items: await this.attachUserNames(items), total }
    }

    async findAccountPage(
        query: ModelUsageLedgerQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<ModelUsageAccountSummary>> {
        const accountKeySql = modelUsageAccountKeySql()
        const recordedAtSql = 'COALESCE(ledger.recordedAt, ledger.createdAt)'
        const take = normalizeTake(options?.take)
        const skip = Math.max(0, Number(options?.skip) || 0)
        const [accountRows, countRow] = await Promise.all([
            this.baseQuery(query)
                .select(accountKeySql, 'accountKey')
                .addSelect(`MAX(${recordedAtSql})`, 'lastUsedAt')
                .groupBy(accountKeySql)
                .orderBy(`MAX(${recordedAtSql})`, 'DESC')
                .addOrderBy(accountKeySql, 'ASC')
                .take(take)
                .skip(skip)
                .getRawMany<{ accountKey: string; lastUsedAt: Date | string }>(),
            this.baseQuery(query)
                .select(`COUNT(DISTINCT ${accountKeySql})`, 'total')
                .getRawOne<{ total: string | number }>()
        ])
        const total = Number(countRow?.total) || 0
        if (!accountRows.length) return { items: [], total }

        const modalitySql = "COALESCE(ledger.modality, 'text')"
        const unitSql = "COALESCE(ledger.unit, 'token')"
        const quantitySql = `CASE WHEN ${unitSql} = 'token' THEN COALESCE(ledger.totalTokens, ledger.tokenUsed, ledger.quantity, 0) ELSE COALESCE(ledger.quantity, 0) END`
        const pricedSettlementSql = `CASE WHEN COALESCE(ledger.pricingStatus, 'unpriced') = 'priced' THEN COALESCE(ledger.settlementAmount, 0) ELSE 0 END`
        const accountKeys = accountRows.map(({ accountKey }) => accountKey)
        const summaryRows = await this.baseQuery(query)
            .andWhere(`${accountKeySql} IN (:...accountKeys)`, { accountKeys })
            .select(accountKeySql, 'accountKey')
            .addSelect(modalitySql, 'modality')
            .addSelect(unitSql, 'unit')
            .addSelect(`COALESCE(SUM(${quantitySql}), 0)`, 'quantity')
            .addSelect(
                `COALESCE(SUM(CASE WHEN ${modalitySql} = 'text' THEN ${pricedSettlementSql} ELSE 0 END), 0)`,
                'llmAmount'
            )
            .addSelect(
                `COALESCE(SUM(CASE WHEN ${modalitySql} = 'video' THEN ${pricedSettlementSql} ELSE 0 END), 0)`,
                'videoAmount'
            )
            .addSelect(`COALESCE(SUM(${pricedSettlementSql}), 0)`, 'totalAmount')
            .groupBy(accountKeySql)
            .addGroupBy(modalitySql)
            .addGroupBy(unitSql)
            .getRawMany<{
                accountKey: string
                modality: ModelUsageLedgerModality
                unit: ModelUsageMetric['unit']
                quantity: string | number
                llmAmount: string | number
                videoAmount: string | number
                totalAmount: string | number
            }>()

        const userIds = accountKeys.filter((accountKey) => accountKey !== UNKNOWN_USAGE_ACCOUNT_KEY)
        const users = userIds.length
            ? await this.userRepository.find({
                  where: {
                      tenantId: RequestContext.currentTenantId(),
                      id: In(userIds)
                  },
                  select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      username: true
                  }
              })
            : []
        const userNames = new Map(users.map((user) => [user.id, displayUserName(user)]))
        const summaries = new Map<string, ModelUsageAccountSummary>()
        for (const row of accountRows) {
            const userId = row.accountKey === UNKNOWN_USAGE_ACCOUNT_KEY ? null : row.accountKey
            summaries.set(row.accountKey, {
                userId,
                userName: userId ? (userNames.get(userId) ?? null) : null,
                lastUsedAt: new Date(row.lastUsedAt),
                usages: [],
                pricedAmounts: { llm: 0, video: 0, total: 0 }
            })
        }
        for (const row of summaryRows) {
            const summary = summaries.get(row.accountKey)
            if (!summary) continue
            summary.usages.push({
                modality: row.modality,
                unit: row.unit,
                quantity: Number(row.quantity) || 0
            })
            summary.pricedAmounts.llm += Number(row.llmAmount) || 0
            summary.pricedAmounts.video += Number(row.videoAmount) || 0
            summary.pricedAmounts.total += Number(row.totalAmount) || 0
        }

        return {
            items: accountRows
                .map(({ accountKey }) => summaries.get(accountKey))
                .filter((summary): summary is ModelUsageAccountSummary => summary !== undefined),
            total
        }
    }

    async findBreakdownPage(
        query: ModelUsageLedgerQuery,
        dimension: ModelUsageBreakdownDimension,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<ModelUsageBreakdownSummary>> {
        const breakdownKeySql = modelUsageBreakdownKeySql(dimension)
        const requestKeySql = modelUsageRequestKeySql()
        const recordedAtSql = 'COALESCE(ledger.recordedAt, ledger.createdAt)'
        const take = normalizeTake(options?.take)
        const skip = Math.max(0, Number(options?.skip) || 0)
        const [pageRows, countRow] = await Promise.all([
            this.baseQuery(query)
                .select(breakdownKeySql, 'breakdownKey')
                .addSelect(`MAX(${recordedAtSql})`, 'lastUsedAt')
                .groupBy(breakdownKeySql)
                .orderBy(`MAX(${recordedAtSql})`, 'DESC')
                .addOrderBy(breakdownKeySql, 'ASC')
                .take(take)
                .skip(skip)
                .getRawMany<{ breakdownKey: string; lastUsedAt: Date | string }>(),
            this.baseQuery(query)
                .select(`COUNT(DISTINCT ${breakdownKeySql})`, 'total')
                .getRawOne<{ total: string | number }>()
        ])
        const total = Number(countRow?.total) || 0
        if (!pageRows.length) return { items: [], total }

        const breakdownKeys = pageRows.map(({ breakdownKey }) => breakdownKey)
        const modalitySql = "COALESCE(ledger.modality, 'text')"
        const unitSql = "COALESCE(ledger.unit, 'token')"
        const quantitySql = `CASE WHEN ${unitSql} = 'token' THEN COALESCE(ledger.totalTokens, ledger.tokenUsed, ledger.quantity, 0) ELSE COALESCE(ledger.quantity, 0) END`
        const pricedSettlementSql = `CASE WHEN COALESCE(ledger.pricingStatus, 'unpriced') = 'priced' THEN COALESCE(ledger.settlementAmount, 0) ELSE 0 END`
        const overviewRows = await this.baseQuery(query)
            .andWhere(`${breakdownKeySql} IN (:...breakdownKeys)`, { breakdownKeys })
            .select(breakdownKeySql, 'breakdownKey')
            .addSelect('MAX(ledger.provider)', 'provider')
            .addSelect('MAX(ledger.model)', 'model')
            .addSelect(`MAX(${recordedAtSql})`, 'lastUsedAt')
            .addSelect(`COUNT(DISTINCT ${requestKeySql})`, 'calls')
            .addSelect(`COALESCE(SUM(${pricedSettlementSql}), 0)`, 'settlementAmount')
            .addSelect(
                "MAX(CASE WHEN COALESCE(ledger.pricingStatus, 'unpriced') = 'priced' THEN 2 WHEN COALESCE(ledger.pricingStatus, 'unpriced') = 'free' THEN 1 ELSE 0 END)",
                'pricingRank'
            )
            .groupBy(breakdownKeySql)
            .getRawMany<{
                breakdownKey: string
                provider: string
                model: string | null
                lastUsedAt: Date | string
                calls: string | number
                settlementAmount: string | number
                pricingRank: string | number
            }>()
        const metricRows = await this.baseQuery(query)
            .andWhere(`${breakdownKeySql} IN (:...breakdownKeys)`, { breakdownKeys })
            .select(breakdownKeySql, 'breakdownKey')
            .addSelect(modalitySql, 'modality')
            .addSelect(unitSql, 'unit')
            .addSelect(`COALESCE(SUM(${quantitySql}), 0)`, 'quantity')
            .groupBy(breakdownKeySql)
            .addGroupBy(modalitySql)
            .addGroupBy(unitSql)
            .getRawMany<{
                breakdownKey: string
                modality: ModelUsageLedgerModality
                unit: ModelUsageMetric['unit']
                quantity: string | number
            }>()
        const modelRows =
            dimension === 'provider'
                ? await this.baseQuery(query)
                      .andWhere(`${breakdownKeySql} IN (:...breakdownKeys)`, { breakdownKeys })
                      .andWhere("NULLIF(ledger.model, '') IS NOT NULL")
                      .select(breakdownKeySql, 'breakdownKey')
                      .addSelect('ledger.model', 'model')
                      .groupBy(breakdownKeySql)
                      .addGroupBy('ledger.model')
                      .getRawMany<{ breakdownKey: string; model: string }>()
                : []

        const summaries = new Map<string, ModelUsageBreakdownSummary>()
        for (const row of overviewRows) {
            summaries.set(row.breakdownKey, {
                key: row.breakdownKey,
                provider: row.provider,
                model: dimension === 'model' ? (row.model ?? null) : null,
                models: [],
                usages: [],
                calls: Number(row.calls) || 0,
                lastUsedAt: new Date(row.lastUsedAt),
                pricingStatus: pricingStatusFromRank(row.pricingRank),
                settlementAmount: Number(row.settlementAmount) || 0
            })
        }
        for (const row of metricRows) {
            summaries.get(row.breakdownKey)?.usages.push({
                modality: row.modality,
                unit: row.unit,
                quantity: Number(row.quantity) || 0
            })
        }
        for (const row of modelRows) {
            const summary = summaries.get(row.breakdownKey)
            if (summary && !summary.models.includes(row.model)) summary.models.push(row.model)
        }

        return {
            items: pageRows
                .map(({ breakdownKey }) => summaries.get(breakdownKey))
                .filter((summary): summary is ModelUsageBreakdownSummary => summary !== undefined),
            total
        }
    }

    async totals(query: ModelUsageLedgerQuery): Promise<ModelUsageLedgerTotals[]> {
        const unitSql = "COALESCE(ledger.unit, 'token')"
        const modalitySql = "COALESCE(ledger.modality, 'text')"
        const rows = await this.baseQuery(query)
            .select(modalitySql, 'modality')
            .addSelect(unitSql, 'unit')
            .addSelect('ledger.priceCurrency', 'currency')
            .addSelect("COALESCE(ledger.pricingStatus, 'unpriced')", 'pricingStatus')
            .addSelect('ledger.settlementCurrency', 'settlementCurrency')
            .addSelect('COALESCE(SUM(ledger.quantity), 0)', 'quantity')
            .addSelect('COALESCE(SUM(ledger.promptTokens), 0)', 'promptTokens')
            .addSelect('COALESCE(SUM(ledger.completionTokens), 0)', 'completionTokens')
            .addSelect(
                `COALESCE(SUM(CASE WHEN ${unitSql} = 'token' THEN COALESCE(ledger.totalTokens, ledger.tokenUsed, 0) ELSE 0 END), 0)`,
                'totalTokens'
            )
            .addSelect('SUM(ledger.priceAmount)', 'amount')
            .addSelect('SUM(ledger.settlementAmount)', 'settlementAmount')
            .addSelect('COUNT(ledger.id)', 'records')
            .groupBy(modalitySql)
            .addGroupBy(unitSql)
            .addGroupBy('ledger.priceCurrency')
            .addGroupBy('ledger.pricingStatus')
            .addGroupBy('ledger.settlementCurrency')
            .getRawMany<{
                modality: ModelUsageLedgerModality
                unit: ModelUsageMetric['unit']
                currency: string | null
                pricingStatus: ModelUsageLedgerTotals['pricingStatus']
                settlementCurrency: string | null
                quantity: string | number
                promptTokens: string | number
                completionTokens: string | number
                totalTokens: string | number
                amount: string | number | null
                settlementAmount: string | number | null
                records: string | number
            }>()
        return rows.map((row) => ({
            modality: row.modality,
            unit: row.unit,
            currency: row.currency,
            pricingStatus: row.pricingStatus,
            settlementCurrency: row.settlementCurrency,
            quantity: Number(row.quantity) || 0,
            promptTokens: Number(row.promptTokens) || 0,
            completionTokens: Number(row.completionTokens) || 0,
            totalTokens: Number(row.totalTokens) || 0,
            amount: row.amount === null ? null : Number(row.amount),
            settlementAmount: row.settlementAmount === null ? null : Number(row.settlementAmount),
            records: Number(row.records) || 0
        }))
    }

    private findByExecutionIds(executionIds: string[], tenantId: string) {
        const ids = [...new Set(executionIds.filter(Boolean))]
        if (!ids.length) return Promise.resolve([])
        return this.repository.find({
            where: {
                tenantId,
                source: MembershipLedgerSourceEnum.ModelUsage,
                originExecutionId: In(ids)
            },
            order: { recordedAt: 'ASC' }
        })
    }

    private async attachUserNames(items: IModelUsageLedger[]): Promise<IModelUsageLedger[]> {
        const userIds = [...new Set(items.map((item) => item.userId).filter((id): id is string => Boolean(id)))]
        if (!userIds.length) return items
        const users = await this.userRepository.find({
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                username: true
            },
            where: {
                tenantId: RequestContext.currentTenantId(),
                id: In(userIds)
            }
        })
        const names = new Map(users.map((user) => [user.id, displayUserName(user)]))
        return items.map((item) => ({
            ...item,
            userName: item.userId ? (names.get(item.userId) ?? null) : null
        }))
    }

    private baseQuery(query: ModelUsageLedgerQuery) {
        const tenantId = RequestContext.currentTenantId()
        const currentOrganizationId = RequestContext.getOrganizationId()
        const qb = createModelUsageReadQuery(this.repository)
            .where('ledger.tenantId = :tenantId', { tenantId })
            .andWhere(`(ledger.source = :modelUsageSource OR (${LEGACY_USAGE_PREDICATE}))`, {
                modelUsageSource: MembershipLedgerSourceEnum.ModelUsage,
                legacyUsageSources: LEGACY_USAGE_SOURCES
            })
        applyExecutionUsageFilters(qb, query, 'projection')
        const organizationId = currentOrganizationId ?? normalizeText(query.organizationId)
        if (organizationId) qb.andWhere('ledger.organizationId = :organizationId', { organizationId })
        const provider = normalizeText(query.provider)
        if (provider) qb.andWhere('ledger.provider = :provider', { provider })
        const model = normalizeText(query.model)
        if (model) qb.andWhere('ledger.model = :model', { model })
        if (query.userIdentity === 'unidentified') {
            qb.andWhere('ledger.userId IS NULL')
        } else {
            const userId = normalizeText(query.userId)
            if (userId) qb.andWhere('ledger.userId = :userId', { userId })
        }
        if (query.unit === 'token') {
            qb.andWhere(`(ledger.unit = :unit OR (${LEGACY_USAGE_PREDICATE}))`, {
                unit: query.unit,
                legacyUsageSources: LEGACY_USAGE_SOURCES
            })
        } else if (query.unit) {
            qb.andWhere('ledger.unit = :unit', { unit: query.unit })
        }
        if (query.modality === 'text') {
            qb.andWhere(`(ledger.modality = :modality OR (${LEGACY_USAGE_PREDICATE}))`, {
                modality: query.modality,
                legacyUsageSources: LEGACY_USAGE_SOURCES
            })
        } else if (query.modality) {
            qb.andWhere('ledger.modality = :modality', { modality: query.modality })
        }
        const currency = normalizeText(query.currency)?.toUpperCase()
        if (currency === 'CNY' || currency === 'RMB') {
            qb.andWhere('UPPER(ledger.priceCurrency) IN (:...currencies)', { currencies: ['CNY', 'RMB'] })
        } else if (currency) {
            qb.andWhere('UPPER(ledger.priceCurrency) = :currency', { currency })
        }
        if (query.pricingStatus) {
            qb.andWhere("COALESCE(ledger.pricingStatus, 'unpriced') = :pricingStatus", {
                pricingStatus: query.pricingStatus
            })
        }
        const start = normalizeDate(query.start)
        if (start) qb.andWhere('COALESCE(ledger.recordedAt, ledger.createdAt) >= :start', { start })
        const end = normalizeDate(query.end)
        if (end) qb.andWhere('COALESCE(ledger.recordedAt, ledger.createdAt) <= :end', { end })
        return qb
    }
}
