ALTER TABLE "xpert_task_execution" ADD COLUMN IF NOT EXISTS "taskSource" varchar(16) NOT NULL DEFAULT 'xpert_task';
