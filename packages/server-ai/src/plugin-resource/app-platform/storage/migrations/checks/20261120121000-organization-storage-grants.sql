SELECT 'organization storage grant' AS missing WHERE to_regclass('app_platform_storage_grant') IS NULL
UNION ALL SELECT 'period grant synchronization' WHERE NOT EXISTS (
 SELECT 1 FROM pg_trigger WHERE tgrelid='user_membership_period'::regclass AND tgname='xpert_organization_storage_period_grant' AND tgenabled='O')
UNION ALL SELECT 'membership grant synchronization' WHERE NOT EXISTS (
 SELECT 1 FROM pg_trigger WHERE tgrelid='user_membership'::regclass AND tgname='xpert_organization_storage_membership_grant' AND tgenabled='O');
