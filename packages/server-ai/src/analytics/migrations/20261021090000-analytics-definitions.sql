-- Provision the current Analytics model. This does not transform any stored bindings.
CREATE TABLE IF NOT EXISTS analytics_definition (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
 "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 "userId" uuid NOT NULL, name varchar NOT NULL, "providerId" varchar NOT NULL,
 visibility varchar NOT NULL DEFAULT 'private', status varchar NOT NULL DEFAULT 'active', "currentVersionId" uuid
);
CREATE INDEX IF NOT EXISTS "IDX_analytics_definition_owner" ON analytics_definition ("tenantId", "organizationId", "userId");
CREATE TABLE IF NOT EXISTS analytics_definition_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT,
 "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 "definitionId" uuid NOT NULL REFERENCES analytics_definition(id) ON DELETE RESTRICT,
 "versionNumber" integer NOT NULL, options json NOT NULL, sha256 varchar NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_analytics_definition_version_number" ON analytics_definition_version ("definitionId", "versionNumber");
