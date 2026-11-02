/* xpert-migration
{"phase":"after-sync","mode":"transactional","dependsOn":["core.platform.20261020000000-platform-types-tables"]}
*/
-- File admission and database triggers share the same account advisory lock.
-- Row bytes are normalized JSON UTF-8 bytes, excluding database indexes/TOAST overhead.
-- Defer guards until commit: plugin transactions may publish files before their SQL commit.
-- Taking an account lock during those writes would deadlock the separate file connection.
CREATE TABLE app_platform_storage_usage (
  "tenantId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "externalBytes" bigint NOT NULL DEFAULT 0 CHECK ("externalBytes" >= 0),
  "databaseBytes" bigint NOT NULL DEFAULT 0 CHECK ("databaseBytes" >= 0),
  PRIMARY KEY ("tenantId", "userId")
);
CREATE TABLE app_platform_storage_relation (relation text PRIMARY KEY, "scopeKind" text NOT NULL CHECK ("scopeKind" IN ('columns','metadata')));

CREATE FUNCTION xpert_app_storage_row_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous jsonb;
  current_row jsonb;
  previous_scope jsonb;
  current_scope jsonb;
  change record;
  used app_platform_storage_usage%ROWTYPE;
  capacity bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN current_row := to_jsonb(NEW); END IF;
  previous_scope := CASE WHEN TG_ARGV[0]='metadata' THEN previous->'metadata' ELSE previous END;
  current_scope := CASE WHEN TG_ARGV[0]='metadata' THEN current_row->'metadata' ELSE current_row END;
  FOR change IN
    SELECT "tenantId", "userId", sum(bytes)::bigint AS delta FROM (
      SELECT d."tenantId", d."userId", -octet_length(previous::text)::bigint AS bytes
      FROM (SELECT DISTINCT "tenantId","userId","organizationId" FROM app_platform_delivery) d WHERE d."tenantId"::text=previous_scope->>'tenantId'
        AND d."organizationId"::text=previous_scope->>'organizationId'
      UNION ALL
      SELECT d."tenantId", d."userId", octet_length(current_row::text)::bigint AS bytes
      FROM (SELECT DISTINCT "tenantId","userId","organizationId" FROM app_platform_delivery) d WHERE d."tenantId"::text=current_scope->>'tenantId'
        AND d."organizationId"::text=current_scope->>'organizationId'
    ) changes GROUP BY "tenantId", "userId" ORDER BY "tenantId", "userId"
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('app-platform-storage:'||change."tenantId"||':'||change."userId",0));
    INSERT INTO app_platform_storage_usage ("tenantId","userId") VALUES (change."tenantId",change."userId") ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT used FROM app_platform_storage_usage WHERE "tenantId"=change."tenantId" AND "userId"=change."userId" FOR UPDATE;
    SELECT min(coalesce((configuration->'environment'->'plans'->(configuration->'definition'->'entitlements'->>'defaultPlanRef')->>'maxStorageBytes')::bigint,2147483648))
      INTO STRICT capacity FROM app_platform_delivery WHERE "tenantId"=change."tenantId" AND "userId"=change."userId";
    IF change.delta>0 AND used."externalBytes"+used."databaseBytes"+change.delta>capacity THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='APP_PLATFORM_FAILURE:application_storage_limit';
    END IF;
    UPDATE app_platform_storage_usage SET "databaseBytes"=greatest(0,"databaseBytes"+change.delta)
      WHERE "tenantId"=change."tenantId" AND "userId"=change."userId";
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE FUNCTION xpert_app_storage_reconcile_account(account_tenant uuid, account_user uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  entry record;
  subtotal bigint;
  total bigint := 0;
  scope_expression text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('app-platform-storage:'||account_tenant||':'||account_user,0));
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

CREATE FUNCTION xpert_app_storage_register_relation(target regclass, scope_kind text DEFAULT 'columns') RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  qualified text;
  account record;
  installed boolean := false;
  registered boolean := false;
BEGIN
  IF scope_kind NOT IN ('columns','metadata') OR
    (scope_kind='columns' AND (SELECT count(*) FROM pg_attribute WHERE attrelid=target AND attname IN ('tenantId','organizationId') AND NOT attisdropped)<>2) OR
    (scope_kind='metadata' AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=target AND attname='metadata' AND atttypid='jsonb'::regtype AND NOT attisdropped)) THEN
    RAISE EXCEPTION 'Account storage requires declared tenant and organization columns';
  END IF;
  SELECT format('%I.%I',n.nspname,c.relname) INTO STRICT qualified FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid=target;
  -- Drain database writers before account locks; this lock still permits file accounting reads.
  EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',target);
  FOR account IN SELECT "tenantId","userId" FROM app_platform_delivery ORDER BY "tenantId","userId" LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('app-platform-storage:'||account."tenantId"||':'||account."userId",0));
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=target AND tgname='xpert_account_storage_guard' AND NOT tgisinternal) THEN
    EXECUTE format('CREATE CONSTRAINT TRIGGER xpert_account_storage_guard AFTER INSERT OR UPDATE OR DELETE ON %s DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xpert_app_storage_row_guard(%L)',target,scope_kind);
    installed := true;
  END IF;
  INSERT INTO app_platform_storage_relation VALUES(qualified,scope_kind) ON CONFLICT DO NOTHING;
  registered := FOUND;
  IF installed OR registered THEN
    FOR account IN SELECT "tenantId","userId" FROM app_platform_delivery ORDER BY "tenantId","userId" LOOP
      PERFORM xpert_app_storage_reconcile_account(account."tenantId",account."userId");
    END LOOP;
  END IF;
END $$;
