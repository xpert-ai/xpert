import type {
    IModelUsageLedger,
    IPagination,
    ModelUsageLedgerQuery,
    ModelUsageLedgerTotals,
    ModelUsageMetric
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import type { EntityManager, FindOptionsWhere, Repository } from 'typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { ModelInvocation } from './model-invocation.entity'
import { ModelUsageLedger } from './model-usage-ledger.entity'
import { isTerminalModelInvocationState } from './model-invocation.utils'

@Injectable()
export class ModelUsageLedgerService {
    constructor(
        @InjectRepository(ModelUsageLedger)
        private readonly repository: Repository<ModelUsageLedger>
    ) {}

    async recordInvocation(manager: EntityManager, invocation: ModelInvocation): Promise<ModelUsageLedger[]> {
        if (!isTerminalModelInvocationState(invocation.providerState) || invocation.usageAvailability !== 'available') {
            return []
        }
        const metrics = invocation.metrics ?? []
        for (const metric of metrics) {
            const entry = manager.create(ModelUsageLedger, toLedgerEntry(invocation, metric))
            await manager.createQueryBuilder().insert().into(ModelUsageLedger).values(entry).orIgnore().execute()
        }
        return manager.find(ModelUsageLedger, { where: { invocationId: invocation.id, revision: 1 } })
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
        const start = parseDate(query.start)
        if (start) qb.andWhere('ledger.recordedAt >= :start', { start })
        const end = parseDate(query.end)
        if (end) qb.andWhere('ledger.recordedAt <= :end', { end })
        return qb
    }
}

function normalizeTake(value?: number) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? Math.min(Math.trunc(number), 200) : 50
}

function normalizeText(value?: string | null) {
    const normalized = value?.trim()
    return normalized || undefined
}

function parseDate(value?: string) {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

function toLedgerEntry(invocation: ModelInvocation, metric: ModelUsageMetric): Partial<ModelUsageLedger> {
    const base: Partial<ModelUsageLedger> = {
        id: randomUUID(),
        tenantId: invocation.tenantId,
        organizationId: invocation.organizationId,
        createdById: invocation.userId ?? undefined,
        invocationId: invocation.id,
        revision: 1,
        userId: invocation.userId,
        originType: invocation.originType,
        originId: invocation.originId,
        originExecutionId: invocation.originExecutionId,
        copilotId: invocation.copilotId,
        providerScopeId: invocation.providerScopeId,
        provider: invocation.provider,
        model: invocation.model,
        modelType: invocation.modelType,
        modality: invocation.modality,
        operation: invocation.operation,
        unit: metric.unit,
        authority: metric.authority,
        status: 'recorded',
        recordedAt: invocation.completedAt ?? new Date()
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
