SELECT 'app_platform_storage_usage.measuredAt' AS missing WHERE NOT EXISTS (
  SELECT 1 FROM pg_attribute WHERE attrelid='app_platform_storage_usage'::regclass AND attname='measuredAt' AND NOT attisdropped
)
UNION ALL SELECT 'app_platform_storage_usage.refreshRequested' WHERE NOT EXISTS (
  SELECT 1 FROM pg_attribute WHERE attrelid='app_platform_storage_usage'::regclass AND attname='refreshRequested' AND NOT attisdropped
)
UNION ALL SELECT 'obsolete account storage trigger' WHERE EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgfoid='xpert_app_storage_row_guard()'::regprocedure AND NOT tgisinternal
);
