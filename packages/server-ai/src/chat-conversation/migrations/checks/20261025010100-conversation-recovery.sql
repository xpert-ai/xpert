SELECT 'chat_conversation.workingThreadRevision' AS missing WHERE NOT EXISTS (
  SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = to_regclass('chat_conversation') AND a.attname = 'workingThreadRevision'
    AND a.atttypid = 'integer'::regtype AND a.attnotnull AND NOT a.attisdropped
    AND pg_get_expr(d.adbin, d.adrelid) = '0'
);
