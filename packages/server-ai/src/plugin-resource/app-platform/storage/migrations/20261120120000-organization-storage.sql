/* xpert-migration
{"phase":"after-sync","mode":"transactional","dependsOn":["ai.app-platform-storage.20261031120000-approximate-storage"]}
*/
-- Keep the last account snapshots for audit, but never copy a multi-organization total
-- into each organization. Cold snapshots are reconciled before admitting new growth.
ALTER TABLE app_platform_storage_usage RENAME TO app_platform_storage_usage_legacy;
CREATE TABLE app_platform_storage_usage (
  "tenantId" uuid NOT NULL,
  "organizationId" uuid NOT NULL,
  "externalBytes" bigint NOT NULL DEFAULT 0 CHECK ("externalBytes">=0),
  "databaseBytes" bigint NOT NULL DEFAULT 0 CHECK ("databaseBytes">=0),
  "measuredAt" timestamptz,
  "refreshRequested" boolean NOT NULL DEFAULT true,
  CONSTRAINT app_platform_storage_organization_pk PRIMARY KEY ("tenantId","organizationId")
);
INSERT INTO app_platform_storage_usage ("tenantId","organizationId")
  SELECT DISTINCT "tenantId","organizationId" FROM app_platform_delivery WHERE "organizationId" IS NOT NULL;

-- Resolve legacy unscoped records only where ownership is unambiguous. Do not use
-- the current organization-member roster: removing a member must not release bytes.
CREATE TEMP TABLE storage_legacy_owners ON COMMIT DROP AS
  SELECT "tenantId","userId",min("organizationId"::text)::uuid AS "organizationId"
    FROM app_platform_delivery WHERE "organizationId" IS NOT NULL
   GROUP BY "tenantId","userId" HAVING count(DISTINCT "organizationId")=1;
UPDATE app_platform_storage_root r SET "organizationId"=o."organizationId"
  FROM storage_legacy_owners o WHERE r."tenantId"=o."tenantId" AND r."userId"=o."userId" AND r."organizationId" IS NULL;
UPDATE storage_file f SET "organizationId"=o."organizationId"
  FROM storage_legacy_owners o WHERE f."tenantId"=o."tenantId" AND f."createdById"=o."userId" AND f."organizationId" IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM app_platform_storage_root WHERE "organizationId" IS NULL) OR EXISTS (
    SELECT 1 FROM storage_file f JOIN app_platform_delivery d ON d."tenantId"=f."tenantId" AND d."userId"=f."createdById"
    WHERE f."organizationId" IS NULL AND f."deletedAt" IS NULL
  ) THEN RAISE EXCEPTION 'Organization storage migration requires explicit ownership for ambiguous legacy files'; END IF;
END $$;
-- Preserve personal roots previously scanned implicitly. New roots are recorded by
-- authorized writes, and remain attributed to their organization after members leave.
INSERT INTO app_platform_storage_root (id,"tenantId","organizationId","userId","pathSuffix")
 SELECT gen_random_uuid(),o."tenantId",o."organizationId",o."userId",'user/'||o."userId"::text
 FROM storage_legacy_owners o ON CONFLICT ("tenantId","pathSuffix") DO NOTHING;

CREATE OR REPLACE FUNCTION xpert_app_storage_reconcile_organization(scope_tenant uuid, scope_organization uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE entry record; subtotal bigint; total bigint := 0; scope_expression text;
BEGIN
  IF scope_tenant IS NULL OR scope_organization IS NULL THEN RAISE EXCEPTION 'Organization storage scope is required'; END IF;
  FOR entry IN SELECT relation,"scopeKind" FROM app_platform_storage_relation ORDER BY relation LOOP
    IF to_regclass(entry.relation) IS NOT NULL THEN
      scope_expression := CASE WHEN entry."scopeKind"='metadata' THEN 'r.metadata' ELSE 'to_jsonb(r)' END;
      EXECUTE format('SELECT coalesce(sum(octet_length(to_jsonb(r)::text)),0)::bigint FROM %s r WHERE (%s)->>''tenantId''=$1::text AND (%s)->>''organizationId''=$2::text',to_regclass(entry.relation),scope_expression,scope_expression)
        INTO subtotal USING scope_tenant,scope_organization;
      total := total+subtotal;
    END IF;
  END LOOP;
  INSERT INTO app_platform_storage_usage ("tenantId","organizationId","databaseBytes") VALUES (scope_tenant,scope_organization,total)
    ON CONFLICT ("tenantId","organizationId") DO UPDATE SET "databaseBytes"=excluded."databaseBytes";
END $$;
-- Retain the historical entry point for migration checks, but reconcile each
-- organization independently rather than recreating an account-wide snapshot.
CREATE OR REPLACE FUNCTION xpert_app_storage_reconcile_account(account_tenant uuid, account_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE entry record;
BEGIN
  FOR entry IN SELECT DISTINCT "organizationId" FROM app_platform_delivery WHERE "tenantId"=account_tenant AND "userId"=account_user AND "organizationId" IS NOT NULL LOOP
    PERFORM xpert_app_storage_reconcile_organization(account_tenant,entry."organizationId");
  END LOOP;
END $$;
