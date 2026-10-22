// Shared protection rules for scheduled retention and explicit administrator cleanup.
export const checkpointProtectionCte = `WITH RECURSIVE branch_checkpoints AS (
    SELECT checkpoint.id, checkpoint.thread_id, checkpoint.checkpoint_ns, checkpoint.checkpoint_id,
           checkpoint.parent_id, checkpoint."tenantId", checkpoint."organizationId"
    FROM chat_message message
    CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(message."outputCheckpoint"->'checkpoints', '[]'::jsonb))
        AS ref("threadId" text, "checkpointNs" text, "checkpointId" text)
    JOIN copilot_checkpoint checkpoint
      ON checkpoint.thread_id = ref."threadId" AND checkpoint.checkpoint_ns = ref."checkpointNs"
     AND checkpoint.checkpoint_id = ref."checkpointId"
     AND checkpoint."tenantId" IS NOT DISTINCT FROM message."tenantId"
     AND checkpoint."organizationId" IS NOT DISTINCT FROM message."organizationId"
    WHERE message."deletedAt" IS NULL
    UNION
    SELECT parent.id, parent.thread_id, parent.checkpoint_ns, parent.checkpoint_id,
           parent.parent_id, parent."tenantId", parent."organizationId"
    FROM branch_checkpoints child JOIN copilot_checkpoint parent
      ON parent.thread_id = child.thread_id AND parent.checkpoint_ns = child.checkpoint_ns
     AND parent.checkpoint_id = child.parent_id
     AND parent."tenantId" IS NOT DISTINCT FROM child."tenantId"
     AND parent."organizationId" IS NOT DISTINCT FROM child."organizationId"
)`

export const checkpointEligiblePredicate = `NOT EXISTS (SELECT 1 FROM branch_checkpoints pinned WHERE pinned.id = c.id)
AND NOT EXISTS (
    SELECT 1 FROM chat_conversation_thread thread
    WHERE thread."threadId" = c.thread_id
      AND thread."runControl" IS NOT NULL
)
AND NOT EXISTS (
    SELECT 1 FROM xpert_agent_execution execution
    WHERE execution."threadId" = c.thread_id
      AND execution."tenantId" IS NOT DISTINCT FROM c."tenantId"
      AND execution."organizationId" IS NOT DISTINCT FROM c."organizationId"
      AND execution.status IN ('pending', 'running', 'interrupted', 'error')
      AND execution.metadata->'recovery'->>'version' = '1'
      AND execution.metadata->'recovery'->'input'->>'threadId' = c.thread_id
      AND execution.metadata->'recovery'->'input'->>'checkpointNs' = c.checkpoint_ns
      AND execution.metadata->'recovery'->'input'->>'checkpointId' = c.checkpoint_id
)
AND NOT EXISTS (
    SELECT 1 FROM chat_message message
    WHERE message."deletedAt" IS NULL
      AND message."createdInThreadId" = c.thread_id
      AND message."inputCheckpoint"->'checkpoint'->>'threadId' = c.thread_id
      AND message."inputCheckpoint"->'checkpoint'->>'checkpointNs' = c.checkpoint_ns
      AND message."inputCheckpoint"->'checkpoint'->>'checkpointId' = c.checkpoint_id
)`

export function buildDeleteWritesByCheckpointIdsSql() {
    return `
WITH candidates AS (
	SELECT "tenantId", "organizationId", thread_id, checkpoint_ns, checkpoint_id
	FROM copilot_checkpoint
	WHERE id = ANY($1::uuid[])
),
deleted AS (
	DELETE FROM copilot_checkpoint_writes w
	USING candidates c
	WHERE w."tenantId" IS NOT DISTINCT FROM c."tenantId"
		AND w."organizationId" IS NOT DISTINCT FROM c."organizationId"
		AND w.thread_id = c.thread_id
		AND w.checkpoint_ns IS NOT DISTINCT FROM c.checkpoint_ns
		AND w.checkpoint_id = c.checkpoint_id
	RETURNING 1
)
SELECT count(*)::int AS count
FROM deleted
`
}

export function buildDeleteCheckpointsByIdsSql() {
    return `
WITH deleted AS (
	DELETE FROM copilot_checkpoint
	WHERE id = ANY($1::uuid[])
	RETURNING 1
)
SELECT count(*)::int AS count
FROM deleted
`
}
