/* xpert-migration
{"phase":"after-sync","mode":"transactional","dependsOn":["ai.app-platform-storage.20261029100000-account-storage"]}
*/
-- Admission uses periodically measured account usage and allows in-flight overshoot.
-- Retain the legacy guard function for historical migration checks, but detach all of its triggers.
ALTER TABLE app_platform_storage_usage ADD COLUMN "measuredAt" timestamptz;
ALTER TABLE app_platform_storage_usage ADD COLUMN "refreshRequested" boolean NOT NULL DEFAULT true;
DO $$
DECLARE entry record;
BEGIN
  FOR entry IN SELECT t.tgrelid::regclass AS relation, t.tgname FROM pg_trigger t
    WHERE t.tgfoid='xpert_app_storage_row_guard()'::regprocedure AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER %I ON %s',entry.tgname,entry.relation);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION xpert_app_storage_reconcile_account(account_tenant uuid, account_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  entry record;
  subtotal bigint;
  total bigint := 0;
  scope_expression text;
BEGIN
  FOR entry IN SELECT relation,"scopeKind" FROM app_platform_storage_relation ORDER BY relation LOOP
    IF to_regclass(entry.relation) IS NOT NULL THEN
      scope_expression := CASE WHEN entry."scopeKind"='metadata' THEN 'r.metadata' ELSE 'to_jsonb(r)' END;
      EXECUTE format('SELECT coalesce(sum(octet_length(to_jsonb(r)::text)),0)::bigint FROM %s r WHERE (%s)->>''tenantId''=$1::text AND (%s)->>''organizationId'' IN (SELECT "organizationId"::text FROM app_platform_delivery WHERE "tenantId"=$1 AND "userId"=$2)',to_regclass(entry.relation),scope_expression,scope_expression)
        INTO subtotal USING account_tenant,account_user;
      total := total+subtotal;
    END IF;
  END LOOP;
  INSERT INTO app_platform_storage_usage ("tenantId","userId","databaseBytes") VALUES (account_tenant,account_user,total)
    ON CONFLICT ("tenantId","userId") DO UPDATE SET "databaseBytes"=excluded."databaseBytes";
END $$;

CREATE OR REPLACE FUNCTION xpert_app_storage_register_relation(target regclass, scope_kind text DEFAULT 'columns') RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  qualified text;
BEGIN
  IF scope_kind NOT IN ('columns','metadata') OR
    (scope_kind='columns' AND (SELECT count(*) FROM pg_attribute WHERE attrelid=target AND attname IN ('tenantId','organizationId') AND NOT attisdropped)<>2) OR
    (scope_kind='metadata' AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname='metadata' AND atttypid='jsonb'::regtype AND NOT attisdropped)) THEN
    RAISE EXCEPTION 'Account storage requires declared tenant and organization columns';
  END IF;
  SELECT format('%I.%I',n.nspname,c.relname) INTO STRICT qualified FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=target;
  INSERT INTO app_platform_storage_relation VALUES(qualified,scope_kind)
    ON CONFLICT (relation) DO UPDATE SET "scopeKind"=excluded."scopeKind";
END $$;
