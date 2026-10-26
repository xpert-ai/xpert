-- PostgreSQL: deploy before enabling ContentCatalogMaintenance.
-- Durable operation intents contain actor identifiers, never authentication tokens.
BEGIN;
CREATE TABLE IF NOT EXISTS content_resource_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
  "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "operationKey" varchar(500) NOT NULL, payload jsonb NOT NULL,
  status varchar NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
  "failureCode" varchar, "nextAttemptAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_operation_key" ON content_resource_operation ("tenantId", "organizationId", "operationKey");
CREATE INDEX IF NOT EXISTS "IDX_content_operation_due" ON content_resource_operation ("nextAttemptAt");
COMMIT;
