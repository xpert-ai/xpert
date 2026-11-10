-- The receipt outlives the Project so the owning application can retry its own transaction.
CREATE TABLE IF NOT EXISTS xpert_project_purge (
    "projectId" uuid PRIMARY KEY,
    "tenantId" uuid NOT NULL,
    "organizationId" uuid,
    "ownerId" uuid NOT NULL,
    "xpertId" uuid NOT NULL,
    "startedAt" timestamptz NOT NULL DEFAULT now(),
    "completedAt" timestamptz
);

-- Provisioning and generic CRUD can race with cleanup, including writes from older hosts.
-- Finalization marks the receipt completed and deletes the Project in the same transaction.
CREATE OR REPLACE FUNCTION guard_project_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT EXISTS (SELECT 1 FROM xpert_project_purge WHERE "projectId" = OLD.id AND "completedAt" IS NULL) THEN
            RETURN OLD;
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM xpert_project_purge WHERE "projectId" = NEW.id) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Permanent Project deletion has been requested'
        USING ERRCODE = '23514', CONSTRAINT = 'CK_project_purge_fence';
END
$$;
DROP TRIGGER IF EXISTS guard_project_purge ON xpert_project;
CREATE TRIGGER guard_project_purge BEFORE INSERT OR UPDATE OR DELETE ON xpert_project
FOR EACH ROW EXECUTE FUNCTION guard_project_purge();
