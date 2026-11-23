SELECT 'plugin_application_installation.organizationSettings' AS missing
WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = to_regclass('plugin_application_installation')
      AND attname = 'organizationSettings' AND atttypid = 'jsonb'::regtype AND NOT attisdropped
);
