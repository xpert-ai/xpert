-- One-time upgrade for installations that tested the separate-table draft.
-- Run after normal schema sync has added api_key.prefix and api_key.revokedAt.
-- Stop the old API before copying, so it cannot create or revoke source rows afterward.
-- Copies digests and lifecycle metadata; never exposes secrets or deletes the source.
BEGIN;
DO $$
BEGIN
    IF to_regclass('personal_api_key') IS NULL THEN
        RETURN;
    END IF;

    LOCK TABLE personal_api_key IN SHARE MODE;
    INSERT INTO api_key (
        id, "createdAt", "updatedAt", "createdById", "updatedById",
        "tenantId", "organizationId", type, "entityId", "userId",
        name, token, prefix, "validUntil", "lastUsedAt", "revokedAt"
    )
    SELECT
        id, "createdAt", "updatedAt", "createdById", "updatedById",
        "tenantId", NULL, 'user', "userId", "userId",
        name, "tokenHash", prefix, "expiresAt", "lastUsedAt", "revokedAt"
    FROM personal_api_key
    ON CONFLICT (id) DO NOTHING;

    IF EXISTS (
        SELECT 1 FROM personal_api_key src
        LEFT JOIN api_key dst ON dst.id = src.id
        WHERE dst.id IS NULL
           OR dst.type IS DISTINCT FROM 'user'
           OR dst.token IS DISTINCT FROM src."tokenHash"
           OR dst."tenantId" IS DISTINCT FROM src."tenantId"
           OR dst."userId" IS DISTINCT FROM src."userId"
           OR dst."entityId" IS DISTINCT FROM src."userId"
           OR dst."organizationId" IS NOT NULL
           OR (src."revokedAt" IS NOT NULL AND dst."revokedAt" IS NULL)
           OR (src."expiresAt" IS NOT NULL AND (dst."validUntil" IS NULL OR dst."validUntil" > src."expiresAt"))
    ) THEN
        RAISE EXCEPTION 'Personal API key migration found a conflicting destination row';
    END IF;
END $$;
COMMIT;
