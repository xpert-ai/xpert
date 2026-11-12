SELECT 'artifact_use_grant.uuid_extension' AS missing
WHERE NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp')
   OR to_regprocedure('uuid_generate_v4()') IS NULL;
