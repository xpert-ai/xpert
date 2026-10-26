import { ManualRetentionRange, ModelGatewayCallStatusEnum } from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { checkpointEligiblePredicate, checkpointProtectionCte } from '../copilot-checkpoint/retention.sql'
import { modelGatewayArchiveDeleteSql } from '../model-gateway/model-gateway-call-retention'

export function manualRetentionCandidates(range: ManualRetentionRange, materialized = false) {
    const checkpoints = range.target === 'copilot_checkpoint'
    const date = checkpoints ? 'c."createdAt"' : 'COALESCE(c."completedAt", c."createdAt")'
    const eligible = checkpoints
        ? checkpointEligiblePredicate
        : `c.status IN ('${ModelGatewayCallStatusEnum.Succeeded}', '${ModelGatewayCallStatusEnum.Failed}')`
    return `${checkpoints ? checkpointProtectionCte + ',' : 'WITH'} matching AS ${materialized ? 'MATERIALIZED ' : ''}(
        SELECT c.id, ${date} AS date, (${eligible}) AS eligible
        FROM ${checkpoints ? 'copilot_checkpoint' : 'model_gateway_call'} c
        WHERE ${date} >= $1::timestamptz AND ${date} < $2::timestamptz
    )`
}

export function manualRetentionPreviewSql(range: ManualRetentionRange) {
    // Share eligibility evaluation between exact totals and the bounded, deterministic batch.
    // Execution keeps its separate candidate query so receipt IDs can still be pushed down.
    return `${manualRetentionCandidates(range, true)}
    SELECT count(*)::int AS matched, count(*) FILTER (WHERE eligible)::int AS eligible,
        ARRAY(SELECT id FROM matching WHERE eligible ORDER BY date, id LIMIT $3::int) AS ids
    FROM matching`
}

export const relatedWritesSql = `SELECT count(*)::int AS count FROM copilot_checkpoint_writes w
    JOIN copilot_checkpoint c ON w."tenantId" IS NOT DISTINCT FROM c."tenantId"
    AND w."organizationId" IS NOT DISTINCT FROM c."organizationId"
    AND w.thread_id = c.thread_id AND w.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
    AND w.checkpoint_id = c.checkpoint_id WHERE c.id = ANY($1::uuid[])`

export function deleteSelectedGatewayCallsSql(manager: EntityManager) {
    return `WITH candidates AS (
        SELECT c.* FROM model_gateway_call c WHERE c.id = ANY($1::uuid[])
        AND c.status IN ('${ModelGatewayCallStatusEnum.Succeeded}', '${ModelGatewayCallStatusEnum.Failed}')
        FOR UPDATE OF c SKIP LOCKED
    ), ${modelGatewayArchiveDeleteSql(manager)}`
}
