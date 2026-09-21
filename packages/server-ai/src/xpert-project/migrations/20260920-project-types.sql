-- Run in a transaction before deploying the new host and plugin versions.
-- NULL pairs intentionally retain unknown legacy provenance.
ALTER TABLE xpert_project
  ADD COLUMN IF NOT EXISTS "applicationKey" varchar(320),
  ADD COLUMN IF NOT EXISTS "projectTypeKey" varchar(100),
  ADD COLUMN IF NOT EXISTS "applicationInstallationId" uuid,
  ADD COLUMN IF NOT EXISTS "projectTypeSnapshot" jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CK_project_type_identity' AND conrelid = 'xpert_project'::regclass) THEN
    ALTER TABLE xpert_project ADD CONSTRAINT "CK_project_type_identity"
      CHECK (("applicationKey" IS NULL AND "projectTypeKey" IS NULL) OR
        ("applicationKey" IS NOT NULL AND "projectTypeKey" IS NOT NULL AND length("applicationKey") > 0 AND length("projectTypeKey") > 0));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "IDX_project_application_type"
  ON xpert_project ("tenantId", "organizationId", "applicationKey", "projectTypeKey", status);
