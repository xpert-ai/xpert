-- Existing configurations are retained. Only new automatic update defaults may be collected.
ALTER TABLE agent_resource_binding ADD COLUMN IF NOT EXISTS "cleanupEligible" boolean NOT NULL DEFAULT false;
