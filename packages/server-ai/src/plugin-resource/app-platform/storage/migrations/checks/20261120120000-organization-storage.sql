SELECT 'organization storage primary key' AS missing WHERE NOT EXISTS (
  SELECT 1 FROM pg_constraint WHERE conrelid='app_platform_storage_usage'::regclass
  AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY ("tenantId", "organizationId")'
)
UNION ALL SELECT 'organization reconciler' WHERE to_regprocedure('xpert_app_storage_reconcile_organization(uuid,uuid)') IS NULL
UNION ALL SELECT 'legacy snapshots' WHERE to_regclass('app_platform_storage_usage_legacy') IS NULL
UNION ALL SELECT 'unscoped root' WHERE EXISTS (SELECT 1 FROM app_platform_storage_root WHERE "organizationId" IS NULL);
