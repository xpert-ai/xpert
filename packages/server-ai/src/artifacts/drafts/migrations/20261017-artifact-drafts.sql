-- Additive migration for installations using external schema management.
CREATE TABLE IF NOT EXISTS artifact_draft (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
    "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
    "tenantId" uuid REFERENCES tenant(id) ON DELETE CASCADE,
    "organizationId" uuid REFERENCES organization(id) ON DELETE CASCADE,
    "artifactId" uuid NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0),
    "baseVersionId" uuid, "publishedRevision" integer, "publishedVersionId" uuid,
    content json NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_artifact_draft_artifact ON artifact_draft ("artifactId");
