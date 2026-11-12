-- Apply before starting a host with Project type configuration enabled.
CREATE TABLE IF NOT EXISTS xpert_project_configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
  "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
  "tenantId" uuid REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid REFERENCES organization(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" uuid REFERENCES xpert_project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  "deletedAt" timestamp,
  "values" jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_project_configuration_project" ON xpert_project_configuration ("projectId");
