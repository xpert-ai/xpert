-- Apply in a transaction before enabling composer.resources.
CREATE TABLE IF NOT EXISTS agent_plugin_package (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "rootPath" varchar NOT NULL, digest varchar NOT NULL, descriptor jsonb NOT NULL, source jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_agent_plugin_package_scope" ON agent_plugin_package ("tenantId", "organizationId", digest);
CREATE TABLE IF NOT EXISTS agent_resource_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  title varchar NOT NULL, description varchar, version varchar NOT NULL,
  "workspaceIds" jsonb NOT NULL, definition jsonb NOT NULL, installations jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS "IDX_agent_resource_binding_scope" ON agent_resource_binding ("tenantId", "organizationId", enabled);
ALTER TABLE skill_package ADD COLUMN IF NOT EXISTS "runtimeResourceOnly" boolean NOT NULL DEFAULT false;

ALTER TABLE agent_resource_binding ADD COLUMN IF NOT EXISTS "supersededById" uuid;

ALTER TABLE agent_resource_binding ADD COLUMN IF NOT EXISTS "expertVersions" jsonb NOT NULL DEFAULT '{}';
