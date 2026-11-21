/* xpert-migration
{"phase":"after-sync","mode":"transactional","dependsOn":["ai.app-platform-storage.20261120120000-organization-storage"]}
*/
-- Source ids are audit references, not cascading user-owned foreign keys. The
-- entitlement is owned by tenant/organization and expires on its original dates.
CREATE TABLE app_platform_storage_grant (
  "tenantId" uuid NOT NULL, "organizationId" uuid NOT NULL,
  "sourceId" uuid NOT NULL, "sourceKind" text NOT NULL CHECK ("sourceKind" IN ('membership','period')),
  "membershipId" uuid NOT NULL, bytes bigint NOT NULL CHECK (bytes>0),
  "startsAt" timestamptz NOT NULL, "endsAt" timestamptz NOT NULL,
  enabled boolean NOT NULL, paused boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("tenantId","organizationId","sourceKind","sourceId")
);
CREATE INDEX ON app_platform_storage_grant ("tenantId","organizationId","endsAt");
CREATE INDEX ON app_platform_storage_grant ("membershipId");

-- Copy existing benefits without editing delivery configurations or plan snapshots.
INSERT INTO app_platform_storage_grant
SELECT p."tenantId",p."organizationId",p.id,'period',p."membershipId",
       (p."planSnapshot"->>'includedStorageBytes')::bigint,p."periodStart",p."periodEnd",
       p.status IN ('active','scheduled'),m.status<>'active'
 FROM user_membership_period p JOIN user_membership m ON m.id=p."membershipId"
 WHERE p."organizationId" IS NOT NULL AND (p."planSnapshot"->>'includedStorageBytes')::bigint>0;
INSERT INTO app_platform_storage_grant
SELECT m."tenantId",m."organizationId",m.id,'membership',m.id,
       (CASE WHEN m."planSnapshot" IS NOT NULL THEN (m."planSnapshot"->>'includedStorageBytes')::bigint ELSE plan."includedStorageBytes" END),
       m."currentPeriodStart",m."currentPeriodEnd",m.status='active',m.status='paused'
 FROM user_membership m LEFT JOIN membership_plan plan ON plan.id=m."planId"
 WHERE m."organizationId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_membership_period p WHERE p."membershipId"=m.id)
 AND (CASE WHEN m."planSnapshot" IS NOT NULL THEN (m."planSnapshot"->>'includedStorageBytes')::bigint ELSE plan."includedStorageBytes" END)>0;

CREATE FUNCTION xpert_organization_storage_period_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity bigint;
BEGIN
  IF current_setting('xpert.storage_member_removal',true)='on' OR NEW."organizationId" IS NULL THEN RETURN NEW; END IF;
  -- Automatic membership assignment on joining an organization is not a storage purchase.
  IF NEW.source IN ('tenant_default','organization') THEN RETURN NEW; END IF;
  DELETE FROM app_platform_storage_grant WHERE "tenantId"=NEW."tenantId" AND "organizationId"=NEW."organizationId" AND "sourceKind"='membership' AND "sourceId"=NEW."membershipId";
  capacity := (NEW."planSnapshot"->>'includedStorageBytes')::bigint;
  IF capacity IS NULL OR capacity<=0 THEN
    UPDATE app_platform_storage_grant SET enabled=false WHERE "tenantId"=NEW."tenantId" AND "organizationId"=NEW."organizationId" AND "sourceKind"='period' AND "sourceId"=NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO app_platform_storage_grant ("tenantId","organizationId","sourceId","sourceKind","membershipId",bytes,"startsAt","endsAt",enabled,paused)
   VALUES (NEW."tenantId",NEW."organizationId",NEW.id,'period',NEW."membershipId",capacity,NEW."periodStart",NEW."periodEnd",NEW.status IN ('active','scheduled'),coalesce((SELECT status<>'active' FROM user_membership WHERE id=NEW."membershipId"),true))
   ON CONFLICT ("tenantId","organizationId","sourceKind","sourceId") DO UPDATE
   SET bytes=excluded.bytes,"startsAt"=excluded."startsAt","endsAt"=excluded."endsAt",enabled=excluded.enabled;
  RETURN NEW;
END $$;
CREATE TRIGGER xpert_organization_storage_period_grant AFTER INSERT OR UPDATE OF "planSnapshot","periodStart","periodEnd",status,source ON user_membership_period
 FOR EACH ROW EXECUTE FUNCTION xpert_organization_storage_period_grant();

CREATE FUNCTION xpert_organization_storage_membership_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity bigint;
BEGIN
  IF current_setting('xpert.storage_member_removal',true)='on' OR NEW."organizationId" IS NULL THEN RETURN NEW; END IF;
  IF NEW.source IN ('tenant_default','organization') THEN RETURN NEW; END IF;
  UPDATE app_platform_storage_grant SET paused=NEW.status<>'active'
    WHERE "tenantId"=NEW."tenantId" AND "organizationId"=NEW."organizationId" AND "membershipId"=NEW.id;
  IF EXISTS (SELECT 1 FROM user_membership_period WHERE "membershipId"=NEW.id) THEN RETURN NEW; END IF;
  IF NEW."planSnapshot" IS NOT NULL THEN capacity := (NEW."planSnapshot"->>'includedStorageBytes')::bigint;
  ELSE SELECT "includedStorageBytes" INTO capacity FROM membership_plan WHERE id=NEW."planId"; END IF;
  IF capacity IS NULL OR capacity<=0 THEN
    UPDATE app_platform_storage_grant SET enabled=false WHERE "tenantId"=NEW."tenantId" AND "organizationId"=NEW."organizationId" AND "sourceKind"='membership' AND "sourceId"=NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO app_platform_storage_grant
    VALUES (NEW."tenantId",NEW."organizationId",NEW.id,'membership',NEW.id,capacity,NEW."currentPeriodStart",NEW."currentPeriodEnd",NEW.status='active',NEW.status='paused')
    ON CONFLICT ("tenantId","organizationId","sourceKind","sourceId") DO UPDATE
    SET bytes=excluded.bytes,"startsAt"=excluded."startsAt","endsAt"=excluded."endsAt",enabled=excluded.enabled,paused=excluded.paused;
  RETURN NEW;
END $$;
CREATE TRIGGER xpert_organization_storage_membership_grant AFTER INSERT OR UPDATE OF "planSnapshot","planId","currentPeriodStart","currentPeriodEnd",status,source ON user_membership
 FOR EACH ROW EXECUTE FUNCTION xpert_organization_storage_membership_grant();
