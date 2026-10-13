-- Apply with DB_SCHEMA_SYNC_MODE=external. Re-runnable; does not touch existing Assistants.
CREATE TABLE IF NOT EXISTS template_installation (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    "workspaceId" uuid NOT NULL REFERENCES xpert_workspace(id) ON DELETE CASCADE,
    "idempotencyKey" varchar(128) NOT NULL, "requestHash" varchar(64) NOT NULL,
    "sourceHash" varchar(64) NOT NULL, language varchar(40) NOT NULL, input jsonb NOT NULL,
    "assistantId" uuid NOT NULL, imported boolean NOT NULL DEFAULT false,
    "publicationCompleted" boolean NOT NULL DEFAULT false,
    status varchar(24) NOT NULL, stage varchar(24) NOT NULL, attempt integer NOT NULL DEFAULT 0,
    "errorCode" varchar(32), "resourceInstallationIds" jsonb NOT NULL DEFAULT '[]',
    "pendingAuthInstallationIds" jsonb NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_template_installation_request"
    ON template_installation ("tenantId", "organizationId", "userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "IDX_template_installation_workspace"
    ON template_installation ("tenantId", "organizationId", "userId", "workspaceId", "createdAt");
