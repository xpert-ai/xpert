SELECT 'app_platform_storage_usage' AS missing WHERE to_regclass('app_platform_storage_usage') IS NULL
UNION ALL SELECT 'app_platform_storage_relation' WHERE to_regclass('app_platform_storage_relation') IS NULL
UNION ALL SELECT 'xpert_app_storage_row_guard' WHERE to_regprocedure('xpert_app_storage_row_guard()') IS NULL
UNION ALL SELECT 'xpert_app_storage_register_relation' WHERE to_regprocedure('xpert_app_storage_register_relation(regclass,text)') IS NULL
UNION ALL SELECT 'xpert_app_storage_reconcile_account' WHERE to_regprocedure('xpert_app_storage_reconcile_account(uuid,uuid)') IS NULL;
