// Invariants: archive the original usage fact and remove its audit record atomically.
// A failed insert rolls back deletion; pending settlements never enter retention.
import {
    DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS,
    MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS,
    MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
    MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
    ModelGatewayCallStatusEnum
} from '@xpert-ai/contracts'
import { TenantSetting } from '@xpert-ai/server-core'
import type { EntityManager } from 'typeorm'
import { MembershipPointLedger } from '../membership/membership-point-ledger.entity'
import { ModelGatewayCall } from './model-gateway-call.entity'
import {
    MODEL_GATEWAY_USAGE_PREDICATE,
    modelGatewayUsageColumns,
    modelGatewayUsageNotRecordedSql
} from './model-gateway-usage'

export async function purgeModelGatewayCallBatch(manager: EntityManager, batchSize: number): Promise<number> {
    const escape = (name: string) => manager.connection.driver.escape(name)
    const table = (path: string) => path.split('.').map(escape).join('.')
    const repository = manager.getRepository(MembershipPointLedger)
    const ledgerTable = table(repository.metadata.tablePath)
    const callTable = table(manager.getRepository(ModelGatewayCall).metadata.tablePath)
    const settingTable = table(manager.getRepository(TenantSetting).metadata.tablePath)
    const columns = modelGatewayUsageColumns(repository)
    const rows: unknown = await manager.query(
        `
WITH candidates AS (
    SELECT c.*
    FROM ${callTable} c
    JOIN ${settingTable} te
        ON te."tenantId" IS NOT DISTINCT FROM c."tenantId"
        AND te.name = $1
        AND lower(COALESCE(te.value, '')) IN ('1', 'true', 'yes', 'on')
    LEFT JOIN ${settingTable} td
        ON td."tenantId" IS NOT DISTINCT FROM c."tenantId"
        AND td.name = $2
    WHERE c.status = ANY($5::varchar[])
        AND COALESCE(c."completedAt", c."createdAt") < now() - make_interval(
            days => COALESCE(
                CASE
                    WHEN td.value ~ '^[1-9][0-9]{0,8}$' AND td.value::int <= $4::int THEN td.value::int
                END,
                $3::int
            )
        )
    ORDER BY COALESCE(c."completedAt", c."createdAt") ASC
    LIMIT $6::int
    FOR UPDATE OF c SKIP LOCKED
),
archived AS (
    INSERT INTO ${ledgerTable} (${columns.map(({ column }) => escape(column.databaseName)).join(', ')})
    SELECT ${columns.map(({ expression }) => expression).join(', ')} FROM candidates g
    WHERE ${MODEL_GATEWAY_USAGE_PREDICATE} AND ${modelGatewayUsageNotRecordedSql(ledgerTable)}
    RETURNING id
),
deleted AS (
    DELETE FROM ${callTable} c
    USING candidates, (SELECT count(*) FROM archived) preserved
    WHERE c.id = candidates.id
    RETURNING 1
)
SELECT count(*)::int AS count FROM deleted
`,
        [
            MODEL_GATEWAY_CALL_RETENTION_ENABLED_SETTING,
            MODEL_GATEWAY_CALL_RETENTION_DAYS_SETTING,
            DEFAULT_MODEL_GATEWAY_CALL_RETENTION_DAYS,
            MAX_MODEL_GATEWAY_CALL_RETENTION_DAYS,
            [ModelGatewayCallStatusEnum.Succeeded, ModelGatewayCallStatusEnum.Failed],
            batchSize
        ]
    )
    if (
        !Array.isArray(rows) ||
        !rows.length ||
        typeof rows[0] !== 'object' ||
        rows[0] === null ||
        !('count' in rows[0])
    ) {
        return 0
    }
    const count = Number(rows[0].count)
    return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
}
