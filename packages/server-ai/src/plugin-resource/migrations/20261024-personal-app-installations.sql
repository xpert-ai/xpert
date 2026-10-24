-- Apply before enabling personal App installation when schema sync is external.
-- Existing organization scope keys and managed resources remain unchanged.
ALTER TABLE plugin_application_installation ADD COLUMN IF NOT EXISTS "ownerUserId" uuid;
CREATE INDEX IF NOT EXISTS "IDX_plugin_application_owner"
  ON plugin_application_installation ("tenantId", "organizationId", "ownerUserId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'plugin_application_installation'::regclass AND conname = 'FK_plugin_application_owner') THEN
    ALTER TABLE plugin_application_installation ADD CONSTRAINT "FK_plugin_application_owner"
      FOREIGN KEY ("ownerUserId") REFERENCES "user"(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'plugin_application_installation'::regclass AND conname = 'CHK_plugin_application_personal_owner') THEN
    ALTER TABLE plugin_application_installation ADD CONSTRAINT "CHK_plugin_application_personal_owner"
      CHECK ("declaredScope" <> 'personal' OR ("ownerUserId" IS NOT NULL AND "organizationId" IS NOT NULL
        AND "scopeKey" = 'personal:' || "organizationId"::text || ':' || "ownerUserId"::text));
  END IF;
END $$;
