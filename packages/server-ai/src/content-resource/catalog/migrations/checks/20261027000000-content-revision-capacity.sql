-- A fresh installation creates this ordinary table during entity synchronization.
SELECT 'content_resource_entry.sourceRevision' AS missing
WHERE to_regclass('content_resource_entry') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'content_resource_entry'
      AND column_name = 'sourceRevision'
      AND data_type = 'character varying'
      AND character_maximum_length = 256
  );
