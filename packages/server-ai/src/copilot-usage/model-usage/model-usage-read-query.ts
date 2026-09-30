import { MembershipLedgerSourceEnum, ModelGatewayUsageChannelEnum } from '@xpert-ai/contracts'
import type { Repository, SelectQueryBuilder } from 'typeorm'
import { MembershipPointLedger } from '../../membership/membership-point-ledger.entity'
import { ModelGatewayCall } from '../../model-gateway/model-gateway-call.entity'
import {
    MODEL_GATEWAY_USAGE_PREDICATE,
    modelGatewayUsageColumns,
    modelGatewayUsageNotRecordedSql
} from '../../model-gateway/model-gateway-usage'

// This is a read projection only: gateway calls already settle through membership billing.
// Call retention preserves the same usage fact before removing audit records.
export function createModelUsageReadQuery(repository: Repository<MembershipPointLedger>) {
    const connection = repository.manager.connection
    const escape = (name: string) => connection.driver.escape(name)
    const table = (path: string) => path.split('.').map(escape).join('.')
    const ledgerTable = table(repository.metadata.tablePath)
    const gatewayTable = table(connection.getMetadata(ModelGatewayCall).tablePath)
    const columns = repository.metadata.columns
    const gateway = modelGatewayUsageColumns(repository)
        .map(({ column, expression }) => `${expression} AS ${escape(column.propertyName.toLowerCase())}`)
        .join(', ')
    const native = columns
        .map((column) => `n.${escape(column.databaseName)} AS ${escape(column.propertyName.toLowerCase())}`)
        .join(', ')
    const query = repository.manager
        .createQueryBuilder()
        .addCommonTableExpression(
            `
            SELECT ${native} FROM ${ledgerTable} n
            WHERE n."tenantId" = :tenantId
                AND (n."usageChannel" IS DISTINCT FROM :readExternalApiChannel OR n.source = :readModelUsageSource)
            UNION ALL
            SELECT ${gateway} FROM ${gatewayTable} g
            WHERE g."tenantId" = :tenantId AND ${MODEL_GATEWAY_USAGE_PREDICATE}
                AND ${modelGatewayUsageNotRecordedSql(ledgerTable)}
        `,
            'model_usage_read'
        )
        .from<MembershipPointLedger>('model_usage_read', 'ledger')
        .setParameters({
            readExternalApiChannel: ModelGatewayUsageChannelEnum.ExternalApi,
            readModelUsageSource: MembershipLedgerSourceEnum.ModelUsage
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
