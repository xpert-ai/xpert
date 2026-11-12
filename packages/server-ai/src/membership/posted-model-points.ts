import type { EntityManager } from 'typeorm'

/** A billable model call can settle against both the plan and the personal balance. */
const POSTED_MODEL_DEBITS_JOIN_SQL = `JOIN membership_point_ledger debit ON debit."tenantId" = fact."tenantId"
            AND debit."userId" = fact."userId" AND debit.source IN ('usage', 'personal_usage')
            AND (debit."sourceReference" IN ('model-usage-charge:' || fact.id,
                    'model-usage-charge:' || fact.id || ':personal')
                 OR debit."gatewayRequestId" = fact."gatewayRequestId")`

/** Sum distinct receipts for the already authorized model facts in a project report. */
export async function postedPointsForFacts(manager: EntityManager, tenantId: string, factIds: string[]) {
    if (!factIds.length) return null
    const [row]: [{ points: string | null }] = await manager.query(
        `SELECT -SUM(receipt."pointsDelta") AS points FROM (
            SELECT DISTINCT debit.id, debit."pointsDelta"
            FROM membership_point_ledger fact
            ${POSTED_MODEL_DEBITS_JOIN_SQL}
            WHERE fact."tenantId" = $1 AND fact.source = 'model_usage' AND fact.id = ANY($2::uuid[])
        ) receipt`,
        [tenantId, factIds]
    )
    return row.points == null ? null : Number(row.points)
}

/**
 * Aggregate posted debits once for the authorized execution IDs in the named CTE.
 * No receipts means no row. A recorded zero remains zero.
 */
export function postedPointsByExecutionSql(executions: 'requested' | 'runs') {
    return `SELECT receipt.execution_id AS id, -SUM(receipt."pointsDelta") AS points
        FROM (
            SELECT DISTINCT fact."originExecutionId" AS execution_id, debit.id, debit."pointsDelta"
            FROM membership_point_ledger fact
            ${POSTED_MODEL_DEBITS_JOIN_SQL}
            WHERE fact."tenantId" = $1 AND fact.source = 'model_usage'
              AND fact."originExecutionId" IN (SELECT id FROM ${executions})
        ) receipt
        GROUP BY receipt.execution_id`
}
