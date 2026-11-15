/* xpert-migration
{ "dependsOn": ["ai.evolution-reviews.20261115010000-execution-review"] }
*/
ALTER TABLE agent_evolution_execution_review
    ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    ADD COLUMN "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    ADD FOREIGN KEY ("tenantId") REFERENCES tenant(id) ON DELETE CASCADE,
    ADD FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- Receipts are immutable. Both timestamps on an existing receipt refer to its original review.
UPDATE agent_evolution_execution_review
SET "createdAt" = (receipt->>'reviewedAt')::timestamptz, "updatedAt" = (receipt->>'reviewedAt')::timestamptz
WHERE receipt->>'reviewedAt' IS NOT NULL;

UPDATE agent_evolution_execution_review r
SET "createdById" = reviewer.id, "updatedById" = reviewer.id
FROM "user" reviewer
WHERE reviewer."tenantId" = r."tenantId" AND reviewer.id::text = r.receipt->>'reviewerId';

CREATE INDEX "IDX_evolution_review_tenant" ON agent_evolution_execution_review ("tenantId");
CREATE INDEX "IDX_evolution_review_organization" ON agent_evolution_execution_review ("organizationId");
