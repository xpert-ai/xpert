/* xpert-migration { "phase": "before-sync" } */
ALTER TABLE IF EXISTS content_resource_entry ADD COLUMN IF NOT EXISTS "containedPaths" jsonb;
DO $$ BEGIN
  IF to_regclass('content_resource_entry') IS NOT NULL THEN
    UPDATE content_resource_entry SET "containedPaths" = "offlineSnapshot"->'containedPaths'
    WHERE "containedPaths" IS NULL AND "offlineSnapshot"->'containedPaths' IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "IDX_content_resource_project_page"
    ON content_resource_entry ("tenantId", "organizationId", "projectId", deleted, "sourceUpdatedAt", id);
  END IF;
END $$;
