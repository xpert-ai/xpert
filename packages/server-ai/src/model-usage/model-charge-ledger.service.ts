import type { ModelUsageMetric, ModelUsagePricingSnapshot, ModelUsageReport } from '@xpert-ai/contracts'
import { calculateModelUsageCharge } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { ModelChargeLedger } from './model-charge-ledger.entity'
import { ModelUsageLedger } from './model-usage-ledger.entity'
import type { ModelUsageRecordingScope } from './model-usage-ledger.service'

@Injectable()
export class ModelChargeLedgerService {
    async record(
        manager: EntityManager,
        scope: ModelUsageRecordingScope,
        report: ModelUsageReport,
        pricingSnapshot: ModelUsagePricingSnapshot,
        usageEntries: ModelUsageLedger[]
    ): Promise<void> {
        const chargedAt = normalizeDate(report.recordedAt) ?? new Date()
        for (const usage of usageEntries) {
            const calculation = calculateModelUsageCharge(pricingSnapshot, toMetric(usage))
            const rule = calculation.pricingRule
            const charge = manager.create(ModelChargeLedger, {
                id: randomUUID(),
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId ?? undefined,
                usageLedgerId: usage.id,
                pricingStatus: calculation.pricingStatus,
                pricingRuleId: rule?.id ?? null,
                pricingRuleVersion: rule?.version ?? null,
                unit: usage.unit,
                quantity: calculation.quantity,
                unitSize: calculation.unitSize ?? null,
                unitPrice: calculation.unitPrice ?? null,
                currency: calculation.currency ?? null,
                amount: calculation.amount ?? null,
                pricingRule: rule ?? null,
                chargedAt
            })
            await manager.createQueryBuilder().insert().into(ModelChargeLedger).values(charge).orIgnore().execute()
        }
    }
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

function normalizeDate(value?: Date | string) {
    if (!value) return undefined
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}
