import type { EntityManager } from 'typeorm'

/** A healthy grant may own a slow live stream; request age alone does not prove worker loss. */
export async function recoverAbandonedExecutionCalls(manager: Pick<EntityManager, 'query'>) {
    return manager.query(`UPDATE model_gateway_call AS c SET
        status = CASE WHEN "dispatchedAt" IS NULL THEN 'failed' ELSE 'settlement_pending' END,
        "reservedTokens" = CASE WHEN "dispatchedAt" IS NULL THEN 0 ELSE "reservedTokens" END,
        "errorCode" = 'worker_lost', "completedAt" = now()
        WHERE source = 'execution_grant' AND status = 'started'
        AND "startedAt" < now() - interval '15 minutes'
        AND NOT EXISTS (
            SELECT 1 FROM model_execution_grant g WHERE g.id = c."grantId"
            AND g."tenantId" = c."tenantId" AND g.status = 'active'
            AND g."expiresAt" > now() AND g."absoluteExpiresAt" > now()
        )`)
}
