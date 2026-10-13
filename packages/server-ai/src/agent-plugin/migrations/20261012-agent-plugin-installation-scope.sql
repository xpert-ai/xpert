-- Tenant installations inherit into organizations. Existing IDs, versions and configurations are retained.
BEGIN;
ALTER TABLE agent_plugin_package ALTER COLUMN "organizationId" DROP NOT NULL;
ALTER TABLE agent_resource_binding ALTER COLUMN "organizationId" DROP NOT NULL;
COMMIT;
