-- Existing read grants intentionally have no data-analysis consent.
ALTER TABLE artifact_use_grant ADD COLUMN IF NOT EXISTS analysis jsonb;
CREATE TABLE IF NOT EXISTS resource_analysis_execution (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenantId" uuid NOT NULL, "organizationId" uuid NOT NULL,
    "grantId" uuid NOT NULL REFERENCES artifact_use_grant(id),
    "referenceId" uuid NOT NULL, "groupId" uuid NOT NULL,
    "actorId" uuid NOT NULL, "assistantId" uuid NOT NULL,
    "executionId" uuid NOT NULL, "grantRevision" integer NOT NULL,
    "datasetKey" varchar(128) NOT NULL, "queryHash" varchar(64) NOT NULL,
    status varchar NOT NULL CHECK (status IN ('running','succeeded','denied')),
    "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IDX_resource_analysis_execution_scope"
    ON resource_analysis_execution ("tenantId", "organizationId", "groupId", "executionId");
