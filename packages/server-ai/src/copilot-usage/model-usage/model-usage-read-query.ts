import { AiModelTypeEnum, MembershipLedgerSourceEnum, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import type { Repository, SelectQueryBuilder } from 'typeorm'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ModelGatewayCall } from '../../model-gateway/model-gateway-call.entity'

// This is a read projection only: gateway calls already settle through membership billing.
// Use one fact per gateway request; debit rows are a fallback when call retention has removed its audit record.
export function createModelUsageReadQuery(repository: Repository<MembershipPointLedger>) {
    const connection = repository.manager.connection
    const escape = (name: string) => connection.driver.escape(name)
    const table = (path: string) => path.split('.').map(escape).join('.')
    const ledgerTable = table(repository.metadata.tablePath)
    const gatewayTable = table(connection.getMetadata(ModelGatewayCall).tablePath)
    const columns = repository.metadata.columns
    const projection = (expressions: Partial<Record<keyof MembershipPointLedger, string>>) =>
        columns
            .map((column) => {
                const expression = expressions[column.propertyName as keyof MembershipPointLedger] ?? 'NULL'
                const type = connection.driver.normalizeType(column)
                return `CAST(${expression} AS ${type}) AS ${escape(column.propertyName.toLowerCase())}`
            })
            .join(', ')
    const requestId = 'CAST(g."requestId" AS varchar)'
    const pricingStatus = (amount: string) =>
        `CASE WHEN ${amount} IS NULL THEN 'unpriced' WHEN ${amount} = 0 THEN 'free' ELSE 'priced' END`
    const common = {
        source: ':readModelUsageSource',
        pointsDelta: '0',
        revision: '0',
        originType: "'model'",
        modelType: ':readLlmType',
        modality: "'text'",
        operation: ':readLlmType',
        metricKey: "'token'",
        unit: "'token'",
        authority: "'provider'",
        priceAuthority: "'provider'",
        usageChannel: ':readExternalApiChannel'
    } satisfies Partial<Record<keyof MembershipPointLedger, string>>
    const gateway = projection({
        ...common,
        id: 'g.id',
        tenantId: 'g."tenantId"',
        organizationId: 'g."organizationId"',
        userId: 'g."userId"',
        createdAt: 'g."createdAt"',
        updatedAt: 'g."updatedAt"',
        createdById: 'g."userId"',
        updatedById: 'g."userId"',
        requestId,
        gatewayRequestId: requestId,
        originId: requestId,
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
        pricingStatus: pricingStatus('g."priceAmount"'),
        priceAmount: 'g."priceAmount"',
        priceCurrency: 'g."priceCurrency"',
        settlementAmount: 'g."settlementAmount"',
        settlementCurrency: 'g."settlementCurrency"',
        exchangeRate: 'g."exchangeRate"'
    })
    const historical = projection({
        ...common,
        id: 'd.id',
        tenantId: 'd."tenantId"',
        organizationId: 'd."organizationId"',
        userId: 'd."userId"',
        createdAt: 'd."createdAt"',
        updatedAt: 'd."updatedAt"',
        requestId: 'd."gatewayRequestId"',
        gatewayRequestId: 'd."gatewayRequestId"',
        originId: 'd."gatewayRequestId"',
        copilotId: 'COALESCE(d."copilotId", \'external_api\')',
        providerScopeId: "CONCAT('external_api:', d.provider)",
        provider: 'd.provider',
        model: 'd.model',
        totalTokens: 'd."gatewayTokens"',
        tokenUsed: 'd."gatewayTokens"',
        priceQuantity: 'd."gatewayTokens"',
        recordedAt: 'd."createdAt"',
        chargedAt: 'd."createdAt"',
        pricingStatus: pricingStatus('d."priceAmount"'),
        priceAmount: 'd."priceAmount"',
        priceCurrency: 'd."priceCurrency"',
        settlementAmount: 'd."gatewaySettlement"',
        settlementCurrency: 'd."settlementCurrency"',
        exchangeRate: 'd."exchangeRate"'
    })
    const native = columns
        .map((column) => `n.${escape(column.databaseName)} AS ${escape(column.propertyName.toLowerCase())}`)
        .join(', ')
    const alreadyRecorded = (tenant: string, request: string) => `NOT EXISTS (
        SELECT 1 FROM ${ledgerTable} recorded
        WHERE recorded."tenantId" = ${tenant} AND recorded.source = :readModelUsageSource
          AND (recorded."requestId" = ${request} OR recorded."gatewayRequestId" = ${request})
    )`
    const debitPartition = 'PARTITION BY d."tenantId", d."gatewayRequestId"'
    const query = repository.manager
        .createQueryBuilder()
        .addCommonTableExpression(
            `
            SELECT DISTINCT ON (d."tenantId", d."gatewayRequestId") d.*,
                SUM(COALESCE(d."tokenUsed", 0)) OVER (${debitPartition}) AS "gatewayTokens",
                SUM(d."settlementAmount") OVER (${debitPartition}) AS "gatewaySettlement"
            FROM ${ledgerTable} d
            WHERE d."tenantId" = :tenantId AND d."usageChannel" = :readExternalApiChannel
                AND d.source IN (:...readDebitSources) AND NULLIF(d."gatewayRequestId", '') IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM ${gatewayTable} g WHERE g."tenantId" = d."tenantId" AND CAST(g."requestId" AS varchar) = d."gatewayRequestId")
            ORDER BY d."tenantId", d."gatewayRequestId", COALESCE(d."tokenUsed", 0) DESC,
                (d."priceAmount" IS NULL) ASC, d."createdAt" ASC, d.id ASC
        `,
            'external_api_debits'
        )
        .addCommonTableExpression(
            `
            SELECT ${native} FROM ${ledgerTable} n
            WHERE n."tenantId" = :tenantId
                AND (n."usageChannel" IS DISTINCT FROM :readExternalApiChannel OR n.source = :readModelUsageSource)
            UNION ALL
            SELECT ${gateway} FROM ${gatewayTable} g
            WHERE g."tenantId" = :tenantId AND g."completedAt" IS NOT NULL AND g.status <> 'started'
                AND (g."totalTokens" > 0 OR g."priceAmount" IS NOT NULL)
                AND ${alreadyRecorded('g."tenantId"', requestId)}
            UNION ALL
            SELECT ${historical} FROM external_api_debits d
            WHERE (d."gatewayTokens" > 0 OR d."priceAmount" IS NOT NULL)
                AND ${alreadyRecorded('d."tenantId"', 'd."gatewayRequestId"')}
        `,
            'model_usage_read'
        )
        .from<MembershipPointLedger>('model_usage_read', 'ledger')
        .setParameters({
            readModelUsageSource: MembershipLedgerSourceEnum.ModelUsage,
            readExternalApiChannel: ModelGatewayUsageChannelEnum.ExternalApi,
            readDebitSources: [MembershipLedgerSourceEnum.Usage, MembershipLedgerSourceEnum.PersonalUsage],
            readLlmType: AiModelTypeEnum.LLM
        })
    return query
}

export async function readModelUsageEntries(
    query: SelectQueryBuilder<MembershipPointLedger>,
    repository: Repository<MembershipPointLedger>
) {
    const columns = repository.metadata.columns
    const escape = (name: string) => repository.manager.connection.driver.escape(name)
    const selection = columns.map(
        (column) => `ledger.${escape(column.propertyName.toLowerCase())} AS ${escape(column.propertyName)}`
    )
    const rows = await query.select(selection).getRawMany<object>()
    return rows.map((row) => {
        const entry = repository.create()
        for (const column of columns) {
            const value: unknown = Reflect.get(row, column.propertyName)
            column.setEntityValue(entry, repository.manager.connection.driver.prepareHydratedValue(value, column))
        }
        return entry
    })
}
