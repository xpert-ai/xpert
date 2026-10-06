-- Append-only business decisions; generic task writers cannot supply this column.
ALTER TABLE xpert_project_task ADD COLUMN IF NOT EXISTS decisions jsonb NOT NULL DEFAULT '[]';
