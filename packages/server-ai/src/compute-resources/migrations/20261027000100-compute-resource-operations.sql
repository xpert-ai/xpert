-- Management evidence survives resource deletion and never contains credentials or file contents.
CREATE TABLE IF NOT EXISTS compute_resource_operation (
  id uuid PRIMARY KEY,
  "tenantId" uuid NOT NULL,
  "organizationId" uuid,
  "resourceId" uuid NOT NULL,
  "resourceName" varchar(100) NOT NULL,
  "containerId" varchar(128) NOT NULL,
  "actorId" uuid NOT NULL,
  reason varchar(500) NOT NULL,
  status varchar(20) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "IDX_compute_resource_operation_scope" ON compute_resource_operation ("tenantId", "organizationId", "resourceId", "createdAt");
