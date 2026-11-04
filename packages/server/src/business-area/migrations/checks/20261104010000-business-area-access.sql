SELECT 'business_area_access_grant' AS missing
WHERE to_regclass('business_area_access_grant') IS NULL
UNION ALL
SELECT 'business_area_access_grant.constraints' AS missing
WHERE (SELECT count(*) FROM pg_constraint WHERE conrelid = to_regclass('business_area_access_grant')
  AND conname IN ('CHK_business_area_grant_subject', 'CHK_business_area_grant_role')) <> 2
UNION ALL
SELECT 'business_area_access_grant.indexes' AS missing
WHERE (SELECT count(*) FROM pg_index WHERE indrelid = to_regclass('business_area_access_grant')
  AND indexrelid IN (to_regclass('"IDX_business_area_grant_user"'), to_regclass('"IDX_business_area_grant_group"'))
  AND indisvalid AND indisunique) <> 2;
