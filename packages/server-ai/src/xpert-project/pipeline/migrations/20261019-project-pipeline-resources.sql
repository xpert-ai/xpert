-- Additive rollout: deploy on every worker before enabling templates with resourceResolverRef.
BEGIN;
ALTER TABLE xpert_project_pipeline_operation ADD COLUMN IF NOT EXISTS "resourceReservation" jsonb;
-- Soft deletion and worker expiry never release physical resource occupancy.
CREATE INDEX IF NOT EXISTS pipeline_operation_resources ON xpert_project_pipeline_operation USING gin ("resourceReservation" jsonb_path_ops)
    WHERE "resourceReservation" IS NOT NULL AND "leaseFence" > 0 AND "terminalObservedAt" IS NULL;
COMMIT;
