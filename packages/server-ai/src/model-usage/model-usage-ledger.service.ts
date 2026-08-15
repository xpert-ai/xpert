import type {
    IModelUsageDetails,
    IModelUsageLedger,
    IPagination,
    ModelUsageLedgerQuery,
    ModelUsageLedgerTotals,
    ModelUsageMetric,
    ModelUsagePricingSnapshot,
    ModelUsageReport,
    ModelUsageReportResult,
    ModelUsageSummary
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { In, type FindOptionsWhere, type Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { ModelChargeLedgerService } from './model-charge-ledger.service'
import { ModelUsageLedger } from './model-usage-ledger.entity'
import { normalizeModelUsageMetrics, summarizeModelUsages } from './model-usage.utils'

export type ModelUsageRecordingScope = {
    tenantId: string
    organizationId?: string | null
    userId?: string | null
    originExecutionId?: string | null
    copilotId: string
    providerScopeId: string
    provider: string
}

@Injectable()
export class ModelUsageLedgerService {
    constructor(
        @InjectRepository(ModelUsageLedger)
        private readonly repository: Repository<ModelUsageLedger>,
        private readonly charges: ModelChargeLedgerService
    ) {}

    async recordUsage(
        scope: ModelUsageRecordingScope,
        report: ModelUsageReport,
        pricingSnapshot: ModelUsagePricingSnapshot
    ): Promise<ModelUsageReportResult> {
        const metrics = normalizeModelUsageMetrics(report.metrics)
        const requestId = requireText(report.requestId, 'request ID')
        const recordedAt = normalizeDate(report.recordedAt) ?? new Date()
        const normalizedReport = { ...report, requestId, recordedAt }

        return this.repository.manager.transaction(async (manager) => {
            let inserted = 0
            for (const metric of metrics) {
                const entry = manager.create(ModelUsageLedger, toLedgerEntry(scope, normalizedReport, metric))
                const result = await manager
                    .createQueryBuilder()
                    .insert()
                    .into(ModelUsageLedger)
                    .values(entry)
                    .orIgnore()
                    .execute()
                inserted += result.identifiers.length
            }
            const entries = await manager.find(ModelUsageLedger, {
                where: {
                    tenantId: scope.tenantId,
                    providerScopeId: scope.providerScopeId,
                    requestId,
                    revision: 1
                }
            })
            await this.charges.record(manager, scope, normalizedReport, pricingSnapshot, entries)
            return {
                requestId,
                recorded: inserted > 0,
                ledgerIds: entries.map((entry) => entry.id)
            }
        })
    }

    async getUsageSummaries(executionIds: string[], tenantId: string): Promise<Map<string, ModelUsageSummary>> {
        const entries = await this.findByExecutionIds(executionIds, tenantId)
        const grouped = groupEntriesByExecution(entries)
        return new Map(
            [...grouped.entries()].map(([executionId, rows]) => [
                executionId,
                summarizeModelUsages(toUsageDetails(rows))
            ])
        )
    }

    async getUsages(executionIds: string[], tenantId: string): Promise<IModelUsageDetails[]> {
        return toUsageDetails(await this.findByExecutionIds(executionIds, tenantId))
    }

    find(where: FindOptionsWhere<ModelUsageLedger>): Promise<IModelUsageLedger[]> {
        return this.repository.find({ where, order: { recordedAt: 'DESC' } })
    }

    async findPage(
        query: ModelUsageLedgerQuery,
        options?: { take?: number; skip?: number }
    ): Promise<IPagination<IModelUsageLedger>> {
        const qb = this.baseQuery(query)
            .leftJoinAndSelect('ledger.charge', 'charge')
            .orderBy('ledger.recordedAt', 'DESC')
            .take(normalizeTake(options?.take))
            .skip(Math.max(0, Number(options?.skip) || 0))
        const [items, total] = await qb.getManyAndCount()
        return { items, total }
    }

    async totals(query: ModelUsageLedgerQuery): Promise<ModelUsageLedgerTotals[]> {
        const rows = await this.baseQuery(query)
            .leftJoin('ledger.charge', 'charge')
            .select('ledger.unit', 'unit')
            .addSelect('charge.currency', 'currency')
            .addSelect("COALESCE(charge.pricingStatus, 'unpriced')", 'pricingStatus')
            .addSelect('COALESCE(SUM(ledger.quantity), 0)', 'quantity')
            .addSelect('COALESCE(SUM(ledger.promptTokens), 0)', 'promptTokens')
            .addSelect('COALESCE(SUM(ledger.completionTokens), 0)', 'completionTokens')
            .addSelect('COALESCE(SUM(ledger.totalTokens), 0)', 'totalTokens')
            .addSelect('SUM(charge.amount)', 'amount')
            .addSelect('COUNT(ledger.id)', 'records')
            .groupBy('ledger.unit')
            .addGroupBy('charge.currency')
            .addGroupBy('charge.pricingStatus')
            .getRawMany<{
                unit: ModelUsageMetric['unit']
                currency: string | null
                pricingStatus: ModelUsageLedgerTotals['pricingStatus']
                quantity: string | number
                promptTokens: string | number
                completionTokens: string | number
                totalTokens: string | number
                amount: string | number | null
                records: string | number
            }>()
        return rows.map((row) => ({
            unit: row.unit,
            currency: row.currency,
            pricingStatus: row.pricingStatus,
            quantity: Number(row.quantity) || 0,
            promptTokens: Number(row.promptTokens) || 0,
            completionTokens: Number(row.completionTokens) || 0,
            totalTokens: Number(row.totalTokens) || 0,
            amount: row.amount === null ? null : Number(row.amount),
            records: Number(row.records) || 0
        }))
    }

    private findByExecutionIds(executionIds: string[], tenantId: string) {
        const ids = [...new Set(executionIds.filter(Boolean))]
        if (!ids.length) return Promise.resolve([])
        return this.repository.find({
            where: { tenantId, originExecutionId: In(ids) },
            order: { recordedAt: 'ASC' }
        })
    }

    private baseQuery(query: ModelUsageLedgerQuery) {
        const tenantId = RequestContext.currentTenantId()
        const currentOrganizationId = RequestContext.getOrganizationId()
        const qb = this.repository.createQueryBuilder('ledger').where('ledger.tenantId = :tenantId', { tenantId })
        const organizationId = currentOrganizationId ?? normalizeText(query.organizationId)
        if (organizationId) qb.andWhere('ledger.organizationId = :organizationId', { organizationId })
        const provider = normalizeText(query.provider)
        if (provider) qb.andWhere('ledger.provider = :provider', { provider })
        const model = normalizeText(query.model)
        if (model) qb.andWhere('ledger.model = :model', { model })
        const userId = normalizeText(query.userId)
        if (userId) qb.andWhere('ledger.userId = :userId', { userId })
        if (query.unit) qb.andWhere('ledger.unit = :unit', { unit: query.unit })
        if (query.modality) qb.andWhere('ledger.modality = :modality', { modality: query.modality })
        const currency = normalizeText(query.currency)
        if (currency) {
            qb.leftJoin('ledger.charge', 'chargeFilter').andWhere('chargeFilter.currency = :currency', { currency })
        }
        if (query.pricingStatus) {
            qb.leftJoin('ledger.charge', 'statusFilter').andWhere('statusFilter.pricingStatus = :pricingStatus', {
                pricingStatus: query.pricingStatus
            })
        }
        const start = normalizeDate(query.start)
        if (start) qb.andWhere('ledger.recordedAt >= :start', { start })
        const end = normalizeDate(query.end)
        if (end) qb.andWhere('ledger.recordedAt <= :end', { end })
        return qb
    }
}

function toLedgerEntry(
    scope: ModelUsageRecordingScope,
    report: ModelUsageReport & { recordedAt: Date },
    metric: ModelUsageMetric
): Partial<ModelUsageLedger> {
    const base: Partial<ModelUsageLedger> = {
        id: randomUUID(),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        createdById: scope.userId ?? undefined,
        requestId: report.requestId,
        revision: 1,
        userId: scope.userId,
        originType: scope.originExecutionId ? 'execution' : 'tool',
        originId: scope.originExecutionId ?? report.requestId,
        originExecutionId: scope.originExecutionId,
        copilotId: scope.copilotId,
        providerScopeId: scope.providerScopeId,
        provider: scope.provider,
        model: report.model,
        modelType: report.modelType,
        toolName: report.toolName,
        modality: report.modality,
        operation: report.operation,
        unit: metric.unit,
        authority: metric.authority,
        status: 'recorded',
        recordedAt: report.recordedAt
    }
    if (metric.unit === 'token') {
        return {
            ...base,
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

function groupEntriesByExecution(entries: ModelUsageLedger[]) {
    const grouped = new Map<string, ModelUsageLedger[]>()
    for (const entry of entries) {
        if (!entry.originExecutionId) continue
        const group = grouped.get(entry.originExecutionId) ?? []
        group.push(entry)
        grouped.set(entry.originExecutionId, group)
    }
    return grouped
}

function toUsageDetails(entries: ModelUsageLedger[]): IModelUsageDetails[] {
    const grouped = new Map<string, ModelUsageLedger[]>()
    for (const entry of entries) {
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

function toMetric(usage: ModelUsageLedger): ModelUsageMetric {
    if (usage.unit === 'token') {
        return {
            unit: 'token',
            promptTokens: usage.promptTokens ?? undefined,
            completionTokens: usage.completionTokens ?? undefined,
            totalTokens: usage.totalTokens ?? undefined,
            authority: 'provider'
        }
    }
    if (usage.unit === 'generation') {
        return {
            unit: 'generation',
            quantity: usage.quantity ?? 0,
            authority: usage.authority === 'contract' ? 'contract' : 'provider'
        }
    }
    return {
        unit: 'second',
        quantity: usage.quantity ?? 0,
        authority: usage.authority === 'request' ? 'request' : 'provider'
    }
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
