/* xpert-migration { "phase": "before-sync" } */
-- TypeORM recreates varchar columns on length changes. Expand in place before
-- entity synchronization so existing provider revisions survive the upgrade.
ALTER TABLE IF EXISTS content_resource_entry
  ALTER COLUMN "sourceRevision" TYPE varchar(256);
