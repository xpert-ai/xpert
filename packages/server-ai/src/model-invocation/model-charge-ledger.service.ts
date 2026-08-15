import type { ModelUsageMetric } from '@xpert-ai/contracts'
import { calculateModelUsageCharge } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { ModelChargeLedger } from './model-charge-ledger.entity'
import { ModelInvocation } from './model-invocation.entity'
import { ModelUsageLedger } from './model-usage-ledger.entity'

@Injectable()
export class ModelChargeLedgerService {
    async recordInvocation(
        manager: EntityManager,
        invocation: ModelInvocation,
        usageEntries: ModelUsageLedger[]
    ): Promise<void> {
        for (const usage of usageEntries) {
            const calculation = calculateModelUsageCharge(invocation.pricingSnapshot, toMetric(usage))
            const rule = calculation.pricingRule
            const charge = manager.create(ModelChargeLedger, {
                id: randomUUID(),
                tenantId: invocation.tenantId,
                organizationId: invocation.organizationId,
                createdById: invocation.userId ?? undefined,
                usageLedgerId: usage.id,
                invocationId: invocation.id,
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
                chargedAt: invocation.completedAt ?? new Date()
            })
            await manager.createQueryBuilder().insert().into(ModelChargeLedger).values(charge).orIgnore().execute()
        }
    }
}

function toMetric(usage: ModelUsageLedger): ModelUsageMetric {
    if (usage.unit === 'token') {
        return {
            unit: 'token' as const,
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
