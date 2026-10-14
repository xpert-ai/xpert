-- Re-runnable additive migration for DB_SCHEMA_SYNC_MODE=external.
ALTER TABLE xpert_task_execution ADD COLUMN IF NOT EXISTS "failureCode" varchar(64);
CREATE TABLE IF NOT EXISTS assistant_template_publication (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    "assistantId" uuid NOT NULL REFERENCES xpert(id) ON DELETE CASCADE,
    visibility varchar(12) NOT NULL, revoked boolean NOT NULL DEFAULT false,
    version varchar(64) NOT NULL, "contentHash" varchar(64) NOT NULL,
    "releaseNotes" text NOT NULL DEFAULT '', content jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assistant_template_publication_source
    ON assistant_template_publication ("tenantId", "organizationId", "assistantId");
CREATE TABLE IF NOT EXISTS assistant_template_upgrade (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    "assistantId" uuid NOT NULL REFERENCES xpert(id) ON DELETE CASCADE,
    state varchar(24) NOT NULL, revision varchar(64) NOT NULL, "sourceHash" varchar(64) NOT NULL,
    before jsonb NOT NULL, after jsonb NOT NULL, baseline jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assistant_template_upgrade_assistant
    ON assistant_template_upgrade ("tenantId", "organizationId", "assistantId", "createdAt");

ALTER TABLE assistant_template_upgrade ADD COLUMN IF NOT EXISTS direction varchar(12) NOT NULL DEFAULT 'upgrade';
ALTER TABLE assistant_template_upgrade ADD COLUMN IF NOT EXISTS prepared boolean NOT NULL DEFAULT false;
