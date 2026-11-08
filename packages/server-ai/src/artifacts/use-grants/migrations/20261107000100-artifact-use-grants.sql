-- Grants are separate from both source ownership and target placement. No public-link audience is created.
CREATE TABLE IF NOT EXISTS artifact_use_grant (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    -- Retained identities, not ownership FKs: source deletion must not delete audit history or be blocked by it.
    "artifactId" uuid NOT NULL,
    "versionId" uuid NOT NULL,
    "ownerProjectId" uuid NOT NULL,
    "targetProjectId" uuid NOT NULL,
    "targetGroupId" uuid NOT NULL,
    permission varchar NOT NULL DEFAULT 'read' CHECK (permission = 'read'),
    status varchar NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'active', 'revoked', 'removed')),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    "issuedById" uuid NOT NULL,
    "acceptedById" uuid, "acceptedAt" timestamptz,
    "closedById" uuid, "closedAt" timestamptz,
    "expiresAt" timestamptz NOT NULL,
    CONSTRAINT "CK_artifact_use_grant_projects" CHECK ("ownerProjectId" <> "targetProjectId"),
    CONSTRAINT "CK_artifact_use_grant_lifecycle" CHECK (
        (status = 'offered' AND "acceptedById" IS NULL AND "acceptedAt" IS NULL AND "closedById" IS NULL AND "closedAt" IS NULL) OR
        (status = 'active' AND "acceptedById" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "closedById" IS NULL AND "closedAt" IS NULL) OR
        (status IN ('revoked', 'removed') AND "closedById" IS NOT NULL AND "closedAt" IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS "IDX_artifact_use_grant_target"
    ON artifact_use_grant ("tenantId", "organizationId", "targetGroupId", "targetProjectId");
CREATE INDEX IF NOT EXISTS "IDX_artifact_use_grant_source"
    ON artifact_use_grant ("tenantId", "organizationId", "artifactId");

-- Retain actor IDs even if membership changes; no API deletes grant/audit history.
CREATE TABLE IF NOT EXISTS artifact_use_grant_audit (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
    "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    "grantId" uuid NOT NULL REFERENCES artifact_use_grant(id),
    "actorId" uuid NOT NULL,
    event varchar NOT NULL CHECK (event IN ('offered', 'accepted', 'revoked', 'removed', 'access', 'denied')),
    revision integer NOT NULL CHECK (revision > 0)
);
CREATE INDEX IF NOT EXISTS "IDX_artifact_use_grant_audit_scope"
    ON artifact_use_grant_audit ("tenantId", "organizationId", "grantId", "createdAt");
