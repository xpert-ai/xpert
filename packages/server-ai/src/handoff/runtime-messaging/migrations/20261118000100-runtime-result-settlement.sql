-- Scope completion reads to owned invocation results, independently of transport scheduling.
CREATE INDEX IF NOT EXISTS "IDX_runtime_delivery_result_scope"
    ON agent_runtime_delivery ("tenantId", "organizationId", "invocationId")
    WHERE event->>'kind' = 'result';
CREATE INDEX IF NOT EXISTS "IDX_runtime_inbox_result_scope"
    ON agent_runtime_inbox ("tenantId", "organizationId", "invocationId", "ownerId")
    WHERE event->>'kind' = 'result';
