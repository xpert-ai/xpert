// Invariants: read and retained facts use the same original call values.
// These facts carry zero point deltas; gateway settlement owns all deductions.
import { AiModelTypeEnum, MembershipLedgerSourceEnum, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'

export const MODEL_GATEWAY_USAGE_PREDICATE = `g."completedAt" IS NOT NULL AND g.status <> 'started' AND (g."totalTokens" > 0 OR g."priceAmount" IS NOT NULL)`

export function modelGatewayUsageColumns(repository: Repository<MembershipPointLedger>) {
    const expressions: Partial<Record<keyof MembershipPointLedger, string>> = {
        source: `'${MembershipLedgerSourceEnum.ModelUsage}'`,
        pointsDelta: '0',
        revision: '0',
        originType: "'model'",
        modelType: `'${AiModelTypeEnum.LLM}'`,
        modality: "'text'",
        operation: `'${AiModelTypeEnum.LLM}'`,
        metricKey: "'token'",
        unit: "'token'",
        authority: "'provider'",
        priceAuthority: "'provider'",
        usageChannel: `'${ModelGatewayUsageChannelEnum.ExternalApi}'`,
        id: 'g.id',
        tenantId: 'g."tenantId"',
        organizationId: 'g."organizationId"',
        userId: 'g."userId"',
        createdAt: 'g."createdAt"',
        updatedAt: 'g."updatedAt"',
        createdById: 'g."userId"',
        updatedById: 'g."userId"',
        requestId: 'CAST(g."requestId" AS varchar)',
        gatewayRequestId: 'CAST(g."requestId" AS varchar)',
        originId: 'CAST(g."requestId" AS varchar)',
        // No copilot identity is retained for unbilled calls; keep this synthetic scope explicit.
        copilotId: "'external_api'",
        providerScopeId: 'CONCAT(\'external_api:\', g."publicationId")',
        provider: 'g.provider',
        model: 'g.model',
        promptTokens: 'g."inputTokens"',
        completionTokens: 'g."outputTokens"',
        totalTokens: 'g."totalTokens"',
        tokenUsed: 'g."totalTokens"',
        priceQuantity: 'g."totalTokens"',
        recordedAt: 'g."completedAt"',
        chargedAt: 'g."completedAt"',
        pricingStatus: `CASE WHEN g."priceAmount" IS NULL THEN 'unpriced' WHEN g."priceAmount" = 0 THEN 'free' ELSE 'priced' END`,
        priceAmount: 'g."priceAmount"',
        priceCurrency: 'g."priceCurrency"',
        settlementAmount: 'g."settlementAmount"',
        settlementCurrency: 'g."settlementCurrency"',
        exchangeRate: 'g."exchangeRate"'
    }
    return repository.metadata.columns.map((column) => ({
        column,
        expression: `CAST(${expressions[column.propertyName as keyof MembershipPointLedger] ?? 'NULL'} AS ${repository.manager.connection.driver.normalizeType(column)})`
    }))
}

export function modelGatewayUsageNotRecordedSql(ledgerTable: string) {
    return `NOT EXISTS (
        SELECT 1 FROM ${ledgerTable} recorded
        WHERE recorded."tenantId" = g."tenantId" AND recorded.source = '${MembershipLedgerSourceEnum.ModelUsage}'
          AND (recorded."requestId" = CAST(g."requestId" AS varchar) OR recorded."gatewayRequestId" = CAST(g."requestId" AS varchar))
    )`
}
