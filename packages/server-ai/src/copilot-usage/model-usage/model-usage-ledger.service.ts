import type {
    IModelChargeLedger,
    IModelUsageDetails,
    IModelUsageLedger,
    IPagination,
    ModelUsageLedgerQuery,
    ModelUsageLedgerTotals,
    ModelUsageLedgerModality,
    ModelUsageLedgerOperation,
    ModelUsageMetric,
    ModelUsageModality,
    ModelUsageOperation,
    ModelUsagePricingSnapshot,
    ModelUsageReport,
    ModelUsageReportResult
} from '@xpert-ai/contracts'
import { AiModelTypeEnum, MembershipLedgerSourceEnum } from '@xpert-ai/contracts'
import { calculateModelUsageCharge } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, User } from '@xpert-ai/server-core'
import { t } from 'i18next'
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
import { modelUsageMetricKey, normalizeModelUsageMetrics } from './model-usage.utils'

const USAGE_HOUR_FORMAT = 'yyyy-MM-dd HH'
const LEGACY_USAGE_SOURCES = [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage]
const LEGACY_USAGE_PREDICATE = `
    ledger.source IN (:...legacyUsageSources)
    AND COALESCE(ledger.tokenUsed, 0) > 0
    AND ledger.settlementAmount IS NULL
`

type StoredModelUsageEntry = MembershipPointLedger & {
    requestId: string
    revision: number
    originType: NonNullable<MembershipPointLedger['originType']>
    originId: string
    copilotId: string
    providerScopeId: string
    provider: string
    modelType: NonNullable<MembershipPointLedger['modelType']>
    modality: ModelUsageModality
    operation: ModelUsageOperation
    unit: NonNullable<MembershipPointLedger['unit']>
    authority: NonNullable<MembershipPointLedger['authority']>
    recordedAt: Date
    pricingStatus: NonNullable<MembershipPointLedger['pricingStatus']>
    priceQuantity: number
    chargedAt: Date
}

type StoredUsageLedgerEntry = MembershipPointLedger & {
    requestId: string
    revision: number
    originType: NonNullable<MembershipPointLedger['originType']>
    originId: string
    copilotId: string
    providerScopeId: string
    provider: string
    modelType: NonNullable<MembershipPointLedger['modelType']>
    modality: ModelUsageLedgerModality
    operation: ModelUsageLedgerOperation
    unit: NonNullable<MembershipPointLedger['unit']>
    authority: NonNullable<MembershipPointLedger['authority']>
    recordedAt: Date
    pricingStatus: NonNullable<MembershipPointLedger['pricingStatus']>
    priceQuantity: number
    chargedAt: Date
}

type LegacyUsageLedgerEntry = MembershipPointLedger & {
    source: MembershipLedgerSourceEnum.Usage | MembershipLedgerSourceEnum.PersonalUsage
    tokenUsed: number
    provider: string
    createdAt: Date
    updatedAt: Date
}

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
            actorId: scope.userId,
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
        const entries = await this.baseQuery(query)
            .andWhere(`${requestKeySql} IN (:...requestKeys)`, {
                requestKeys: requestRows.map(({ requestKey }) => requestKey)
            })
            .orderBy('COALESCE(ledger.recordedAt, ledger.createdAt)', 'DESC')
            .getMany()
        const items = entries.map(toUsageLedgerItem).filter((entry): entry is IModelUsageLedger => entry !== null)
        return { items: await this.attachUserNames(items), total }
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
        const qb = this.repository
            .createQueryBuilder('ledger')
            .where('ledger.tenantId = :tenantId', { tenantId })
            .andWhere(`(ledger.source = :modelUsageSource OR (${LEGACY_USAGE_PREDICATE}))`, {
                modelUsageSource: MembershipLedgerSourceEnum.ModelUsage,
                legacyUsageSources: LEGACY_USAGE_SOURCES
            })
        const organizationId = currentOrganizationId ?? normalizeText(query.organizationId)
        if (organizationId) qb.andWhere('ledger.organizationId = :organizationId', { organizationId })
        const provider = normalizeText(query.provider)
        if (provider) qb.andWhere('ledger.provider = :provider', { provider })
        const model = normalizeText(query.model)
        if (model) qb.andWhere('ledger.model = :model', { model })
        const userId = normalizeText(query.userId)
        if (userId) qb.andWhere('ledger.userId = :userId', { userId })
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

function modelUsageRequestKeySql() {
    return "CONCAT(COALESCE(ledger.providerScopeId, ''), ':', COALESCE(NULLIF(ledger.requestId, ''), CONCAT('legacy:', ledger.id)))"
}

function toLedgerEntry(
    scope: CopilotModelUsageRecordingScope,
    report: ModelUsageReport & { recordedAt: Date },
    metric: ModelUsageMetric,
    pricingSnapshot: ModelUsagePricingSnapshot
): Partial<MembershipPointLedger> {
    const calculation = calculateModelUsageCharge(pricingSnapshot, metric)
    const settlement = settleChargeToCny(calculation)
    const rule = calculation.pricingRule
    const base: Partial<MembershipPointLedger> = {
        id: randomUUID(),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        runtimeOrganizationId: scope.organizationId,
        createdById: scope.userId ?? undefined,
        actorId: scope.userId ?? undefined,
        userId: scope.userId,
        source: MembershipLedgerSourceEnum.ModelUsage,
        pointsDelta: 0,
        requestId: report.requestId,
        revision: 1,
        originType: scope.originType ?? (scope.originExecutionId ? 'execution' : 'tool'),
        originId: scope.originId ?? scope.originExecutionId ?? report.requestId,
        originExecutionId: scope.originExecutionId,
        xpertId: scope.xpertId,
        copilotId: scope.copilotId,
        providerScopeId: scope.providerScopeId,
        provider: scope.provider,
        model: report.model,
        modelType: report.modelType,
        toolName: report.toolName,
        modality: report.modality,
        operation: report.operation,
        metricKey: modelUsageMetricKey(metric),
        component: metric.component ?? null,
        pricingDimensions: metric.pricingDimensions ?? null,
        unit: metric.unit,
        authority: metric.authority,
        recordedAt: report.recordedAt,
        usageHour: formatInUTC0(report.recordedAt, USAGE_HOUR_FORMAT),
        pricingStatus: calculation.pricingStatus,
        pricingRuleId: rule?.id ?? null,
        pricingRuleVersion: rule?.version ?? null,
        priceQuantity: calculation.quantity,
        unitSize: calculation.unitSize ?? null,
        unitPrice: calculation.unitPrice ?? null,
        priceCurrency: calculation.currency ?? null,
        priceAmount: calculation.amount ?? null,
        pricingRule: rule ?? null,
        chargedAt: report.recordedAt,
        settlementCurrency: settlement?.currency ?? null,
        settlementAmount: settlement?.amount ?? null,
        exchangeRate: settlement?.exchangeRate ?? null
    }
    if (metric.unit === 'token') {
        return {
            ...base,
            tokenUsed: metric.totalTokens ?? null,
            promptTokens: metric.promptTokens ?? null,
            completionTokens: metric.completionTokens ?? null,
            totalTokens: metric.totalTokens ?? null,
            quantity: null
        }
    }
    return {
        ...base,
        quantity: metric.quantity,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null
    }
}

function toUsageDetails(entries: MembershipPointLedger[]): IModelUsageDetails[] {
    const grouped = new Map<string, StoredModelUsageEntry[]>()
    for (const entry of entries) {
        if (!isStoredModelUsageEntry(entry)) continue
        const key = `${entry.providerScopeId}:${entry.requestId}`
        const group = grouped.get(key) ?? []
        group.push(entry)
        grouped.set(key, group)
    }
    return [...grouped.values()].map((rows) => {
        const first = rows[0]
        return {
            requestId: first.requestId,
            providerScopeId: first.providerScopeId,
            originExecutionId: first.originExecutionId,
            provider: first.provider,
            model: first.model,
            modelType: first.modelType,
            toolName: first.toolName,
            modality: first.modality,
            operation: first.operation,
            metrics: rows.map(toMetric),
            recordedAt: first.recordedAt
        }
    })
}

function toUsageLedgerDto(entry: StoredUsageLedgerEntry): IModelUsageLedger {
    return {
        id: entry.id,
        tenantId: entry.tenantId,
        organizationId: entry.organizationId,
        createdById: entry.createdById,
        updatedById: entry.updatedById,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        requestId: entry.requestId,
        revision: entry.revision,
        userId: entry.userId,
        originType: entry.originType,
        originId: entry.originId,
        originExecutionId: entry.originExecutionId,
        copilotId: entry.copilotId,
        providerScopeId: entry.providerScopeId,
        provider: entry.provider,
        model: entry.model,
        modelType: entry.modelType,
        toolName: entry.toolName,
        modality: entry.modality,
        operation: entry.operation,
        metricKey: entry.metricKey ?? (entry.component ? `${entry.component}:${entry.unit}` : entry.unit),
        component: entry.component,
        pricingDimensions: entry.pricingDimensions,
        unit: entry.unit,
        authority: entry.authority,
        quantity: entry.quantity,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        totalTokens: entry.totalTokens,
        recordedAt: entry.recordedAt,
        charge: toChargeDto(entry)
    }
}

function toUsageLedgerItem(entry: MembershipPointLedger): IModelUsageLedger | null {
    if (isStoredUsageLedgerEntry(entry)) {
        return toUsageLedgerDto(entry)
    }
    if (isLegacyUsageLedgerEntry(entry)) {
        return toLegacyUsageLedgerDto(entry)
    }
    return null
}

function toLegacyUsageLedgerDto(entry: LegacyUsageLedgerEntry): IModelUsageLedger {
    const recordedAt = entry.createdAt
    return {
        id: entry.id,
        tenantId: entry.tenantId,
        organizationId: entry.organizationId,
        createdById: entry.createdById,
        updatedById: entry.updatedById,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        requestId: `legacy:${entry.id}`,
        revision: 0,
        userId: entry.userId,
        originType: 'model',
        originId: entry.threadId ?? entry.xpertId ?? entry.copilotId ?? entry.id,
        originExecutionId: null,
        copilotId: entry.copilotId ?? 'legacy',
        providerScopeId: `legacy:${entry.provider}`,
        provider: entry.provider,
        model: entry.model,
        modelType: AiModelTypeEnum.LLM,
        toolName: null,
        modality: 'text',
        operation: AiModelTypeEnum.LLM,
        metricKey: 'token',
        component: null,
        pricingDimensions: null,
        unit: 'token',
        authority: 'provider',
        quantity: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: entry.tokenUsed,
        recordedAt,
        charge: {
            id: entry.id,
            tenantId: entry.tenantId,
            organizationId: entry.organizationId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            usageLedgerId: entry.id,
            pricingStatus: 'unpriced',
            pricingRuleId: null,
            pricingRuleVersion: null,
            unit: 'token',
            quantity: entry.tokenUsed,
            unitSize: null,
            unitPrice: null,
            currency: null,
            amount: null,
            pricingRule: null,
            chargedAt: recordedAt,
            settlementCurrency: null,
            settlementAmount: null,
            exchangeRate: null
        }
    }
}

function toChargeDto(entry: StoredUsageLedgerEntry): IModelChargeLedger {
    return {
        id: entry.id,
        tenantId: entry.tenantId,
        organizationId: entry.organizationId,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        usageLedgerId: entry.id,
        pricingStatus: entry.pricingStatus,
        pricingRuleId: entry.pricingRuleId,
        pricingRuleVersion: entry.pricingRuleVersion,
        unit: entry.unit,
        quantity: entry.priceQuantity,
        unitSize: entry.unitSize,
        unitPrice: entry.unitPrice,
        currency: entry.priceCurrency,
        amount: entry.priceAmount,
        priceAuthority: entry.priceAuthority,
        pricingRule: entry.pricingRule,
        pricingBreakdown: entry.pricingBreakdown,
        chargedAt: entry.chargedAt,
        settlementCurrency: entry.settlementCurrency,
        settlementAmount: entry.settlementAmount,
        exchangeRate: entry.exchangeRate
    }
}

function toMetric(usage: StoredModelUsageEntry): ModelUsageMetric {
    const qualifiers = {
        key: usage.metricKey ?? (usage.component ? `${usage.component}:${usage.unit}` : usage.unit),
        ...(usage.component ? { component: usage.component } : {}),
        ...(usage.pricingDimensions ? { pricingDimensions: usage.pricingDimensions } : {})
    }
    if (usage.unit === 'token') {
        return {
            ...qualifiers,
            unit: 'token',
            promptTokens: usage.promptTokens ?? undefined,
            completionTokens: usage.completionTokens ?? undefined,
            totalTokens: usage.totalTokens ?? undefined,
            authority: 'provider'
        }
    }
    if (usage.unit === 'generation') {
        return {
            ...qualifiers,
            unit: 'generation',
            quantity: usage.quantity ?? 0,
            authority: usage.authority === 'contract' ? 'contract' : 'provider'
        }
    }
    if (usage.unit === 'second' || usage.unit === 'character') {
        return {
            ...qualifiers,
            unit: usage.unit,
            quantity: usage.quantity ?? 0,
            authority: usage.authority === 'request' ? 'request' : 'provider'
        }
    }
    return {
        ...qualifiers,
        unit: 'request',
        quantity: usage.quantity ?? 0,
        authority: usage.authority === 'contract' ? 'contract' : 'provider'
    }
}

function isStoredModelUsageEntry(entry: MembershipPointLedger): entry is StoredModelUsageEntry {
    return (
        typeof entry.requestId === 'string' &&
        typeof entry.revision === 'number' &&
        (entry.originType === 'execution' || entry.originType === 'tool') &&
        typeof entry.originId === 'string' &&
        typeof entry.copilotId === 'string' &&
        typeof entry.providerScopeId === 'string' &&
        typeof entry.provider === 'string' &&
        entry.modelType !== null &&
        entry.modelType !== undefined &&
        (entry.modality === 'text' ||
            entry.modality === 'audio' ||
            entry.modality === 'image' ||
            entry.modality === 'video') &&
        typeof entry.operation === 'string' &&
        (entry.unit === 'token' ||
            entry.unit === 'generation' ||
            entry.unit === 'second' ||
            entry.unit === 'character' ||
            entry.unit === 'request') &&
        typeof entry.authority === 'string' &&
        entry.recordedAt instanceof Date &&
        (entry.pricingStatus === 'priced' || entry.pricingStatus === 'free' || entry.pricingStatus === 'unpriced') &&
        typeof entry.priceQuantity === 'number' &&
        entry.chargedAt instanceof Date
    )
}

function isStoredUsageLedgerEntry(entry: MembershipPointLedger): entry is StoredUsageLedgerEntry {
    return (
        typeof entry.requestId === 'string' &&
        typeof entry.revision === 'number' &&
        (entry.originType === 'execution' || entry.originType === 'tool' || entry.originType === 'model') &&
        typeof entry.originId === 'string' &&
        typeof entry.copilotId === 'string' &&
        typeof entry.providerScopeId === 'string' &&
        typeof entry.provider === 'string' &&
        entry.modelType !== null &&
        entry.modelType !== undefined &&
        (entry.modality === 'text' ||
            entry.modality === 'audio' ||
            entry.modality === 'image' ||
            entry.modality === 'video') &&
        typeof entry.operation === 'string' &&
        (entry.unit === 'token' ||
            entry.unit === 'generation' ||
            entry.unit === 'second' ||
            entry.unit === 'character' ||
            entry.unit === 'request') &&
        typeof entry.authority === 'string' &&
        entry.recordedAt instanceof Date &&
        (entry.pricingStatus === 'priced' || entry.pricingStatus === 'free' || entry.pricingStatus === 'unpriced') &&
        typeof entry.priceQuantity === 'number' &&
        entry.chargedAt instanceof Date
    )
}

function isLegacyUsageLedgerEntry(entry: MembershipPointLedger): entry is LegacyUsageLedgerEntry {
    return (
        (entry.source === MembershipLedgerSourceEnum.Usage ||
            entry.source === MembershipLedgerSourceEnum.PersonalUsage) &&
        typeof entry.tokenUsed === 'number' &&
        entry.tokenUsed > 0 &&
        (entry.settlementAmount === null || entry.settlementAmount === undefined) &&
        typeof entry.provider === 'string' &&
        entry.createdAt instanceof Date &&
        entry.updatedAt instanceof Date
    )
}

function requireText(value: string | null | undefined, label: string) {
    const normalized = value?.trim()
    if (!normalized) {
        throw new Error(
            t('server-ai:Error.ModelUsageFieldRequired', {
                field: label,
                defaultValue: "Model usage field '{{field}}' is required."
            })
        )
    }
    return normalized
}

function normalizeTake(value?: number) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.min(Math.trunc(number), 200) : 50
}

function normalizeText(value?: string | null) {
    const normalized = value?.trim()
    return normalized || undefined
}

function normalizeDate(value?: Date | string) {
    if (!value) return undefined
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

function normalizeTokenCount(value: number | null | undefined) {
    const normalized = Math.trunc(Number(value))
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function normalizeOptionalTokenCount(value: number | null | undefined) {
    const normalized = normalizeTokenCount(value)
    return normalized || null
}

function normalizePriceAmount(value: number | null | undefined) {
    if (value === null || value === undefined) return undefined
    const normalized = Number(value)
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined
}

function displayUserName(user: User) {
    return (
        user.name?.trim() ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
        user.email?.trim() ||
        user.username?.trim() ||
        null
    )
}
