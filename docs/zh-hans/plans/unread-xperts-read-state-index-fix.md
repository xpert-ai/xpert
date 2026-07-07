# unread/xperts safe SQL for historical databases

This runbook supports the optimized `POST /api/chat-conversation/unread/xperts`
query on databases that already contain historical `chat_message` and
`chat_conversation_read_state` data.

The application no longer requires
`IDX_chat_conversation_read_state_tenant_unique` to start. Do not create that
unique partial index as part of this fix; historical tenant-scope read-state
duplicates are tolerated by the query and by the write path.

## When to Run

Run this after deploying the unread/xperts code change, or before deployment if
you want the helper indexes ready first.

If a previous startup failed while creating
`IDX_chat_conversation_read_state_tenant_unique`, use the invalid-index check
below and drop only the invalid leftover index.

## Important Notes

- Run against the PostgreSQL database used by Xpert, for example `ocap`.
- `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` must not run inside
  `BEGIN` / `COMMIT`.
- The duplicate cleanup section is optional. The code handles duplicate
  tenant-scope read states by reading the newest row.
- The helper indexes are non-unique and should be created manually or through a
  migration, not by TypeORM `synchronize` during app startup.

## Execute

```bash
docker exec -i xpert-db-1 psql -U postgres -d ocap <<'SQL'
\set ON_ERROR_STOP on

-- 0. Confirm this is the same database used by the API.
SELECT
  current_database() AS database,
  current_user AS user_name,
  inet_server_addr() AS server_addr,
  inet_server_port() AS server_port;

-- 1. Inspect duplicate tenant-scope read states. Duplicates are now tolerated,
--    but this shows whether historical cleanup is still useful.
SELECT
  "tenantId",
  "conversationId",
  "userId",
  COUNT(*) AS duplicates
FROM chat_conversation_read_state
WHERE "organizationId" IS NULL
GROUP BY "tenantId", "conversationId", "userId"
HAVING COUNT(*) > 1
ORDER BY duplicates DESC
LIMIT 50;

-- 2. Check whether a failed concurrent unique-index build left an invalid
--    leftover index.
SELECT
  cls.relname AS indexname,
  idx.indisvalid,
  idx.indisready
FROM pg_class cls
JOIN pg_index idx ON idx.indexrelid = cls.oid
WHERE cls.relname = 'IDX_chat_conversation_read_state_tenant_unique';

-- If the query above returns a row with indisvalid = false, run this line once:
-- DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_conversation_read_state_tenant_unique";

-- 3. Create non-unique helper indexes used by unread/xperts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_conversation_unread_xpert_scope"
ON chat_conversation ("tenantId", "organizationId", "createdById", "xpertId", id)
WHERE "createdById" IS NOT NULL AND "xpertId" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_message_unread_ai_conversation_created"
ON chat_message ("conversationId", "createdAt", id)
WHERE role = 'ai' AND "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_conversation_read_state_unread_lookup"
ON chat_conversation_read_state (
  "tenantId",
  "organizationId",
  "userId",
  "conversationId",
  "lastReadAt" DESC,
  "updatedAt" DESC,
  id DESC
);

ANALYZE chat_conversation;
ANALYZE chat_message;
ANALYZE chat_conversation_read_state;
SQL
```

## Optional Duplicate Cleanup

This is no longer required for app startup. Run it only during a maintenance
window if you want to reduce historical read-state noise.

```bash
docker exec -i xpert-db-1 psql -U postgres -d ocap <<'SQL'
\set ON_ERROR_STOP on

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "conversationId", "userId"
      ORDER BY "lastReadAt" DESC NULLS LAST, "updatedAt" DESC NULLS LAST, id DESC
    ) AS rn
  FROM chat_conversation_read_state
  WHERE "organizationId" IS NULL
)
DELETE FROM chat_conversation_read_state rs
USING ranked
WHERE rs.id = ranked.id
  AND ranked.rn > 1;

ANALYZE chat_conversation_read_state;
SQL
```

## Verify

```bash
docker exec -i xpert-db-1 psql -U postgres -d ocap <<'SQL'
\set ON_ERROR_STOP on

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN (
  'chat_conversation',
  'chat_message',
  'chat_conversation_read_state'
)
  AND indexname IN (
    'IDX_chat_conversation_unread_xpert_scope',
    'IDX_chat_message_unread_ai_conversation_created',
    'IDX_chat_conversation_read_state_unread_lookup'
  )
ORDER BY tablename, indexname;
SQL
```

Expected result: all three non-unique helper indexes are listed.
