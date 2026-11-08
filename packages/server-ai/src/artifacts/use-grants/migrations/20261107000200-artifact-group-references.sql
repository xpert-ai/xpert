-- Existing Project placements retain their source ACL; group placements are never registered in that catalog.
CREATE TABLE IF NOT EXISTS artifact_reference (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
    "tenantId" uuid REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid REFERENCES organization(id) ON DELETE CASCADE,
    "projectId" uuid NOT NULL, "artifactId" uuid NOT NULL, "versionId" uuid NOT NULL,
    title varchar(200) NOT NULL, revision integer NOT NULL DEFAULT 1, deleted boolean NOT NULL DEFAULT false
);
ALTER TABLE artifact_reference ADD COLUMN IF NOT EXISTS "groupId" uuid;
ALTER TABLE artifact_reference ADD COLUMN IF NOT EXISTS "useGrantId" uuid;
DROP INDEX IF EXISTS "IDX_49f867757dc5ee09b99e1c23bc";
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_artifact_reference_project"
    ON artifact_reference ("tenantId", "organizationId", "projectId", "artifactId") WHERE "groupId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_artifact_reference_group_grant"
    ON artifact_reference ("tenantId", "organizationId", "projectId", "groupId", "useGrantId") WHERE "groupId" IS NOT NULL;
ALTER TABLE artifact_reference DROP CONSTRAINT IF EXISTS "CK_artifact_reference_group_grant";
ALTER TABLE artifact_reference ADD CONSTRAINT "CK_artifact_reference_group_grant"
    CHECK (("groupId" IS NULL) = ("useGrantId" IS NULL));
ALTER TABLE artifact_use_grant_audit DROP CONSTRAINT IF EXISTS artifact_use_grant_audit_event_check;
ALTER TABLE artifact_use_grant_audit ADD CONSTRAINT artifact_use_grant_audit_event_check
    CHECK (event IN ('offered', 'accepted', 'revoked', 'removed', 'access', 'denied', 'reference_attached', 'reference_removed'));
