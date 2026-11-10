SELECT 'xpert_project_purge' AS missing
WHERE to_regclass('xpert_project_purge') IS NULL
UNION ALL
SELECT 'guard_project_purge' WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'xpert_project'::regclass
    AND tgname = 'guard_project_purge' AND tgenabled IN ('O', 'A')
);
