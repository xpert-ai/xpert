CREATE TABLE IF NOT EXISTS agent_evolution_execution_review (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" uuid NOT NULL, "organizationId" uuid NOT NULL,
    "targetId" varchar NOT NULL, "executionId" uuid NOT NULL,
    "projectId" uuid NOT NULL, "conversationId" uuid NOT NULL,
    "bundleHash" varchar NOT NULL, receipt jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_evolution_review_execution"
    ON agent_evolution_execution_review ("tenantId", "organizationId", "targetId", "executionId");
