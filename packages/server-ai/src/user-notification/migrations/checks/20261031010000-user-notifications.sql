WITH expected(table_name, column_name, data_type, not_null) AS (
 VALUES
 ('announcement','tenantId','uuid',true), ('announcement','revision','integer',true), ('announcement','clients','jsonb',true),
 ('announcement','startsAt','timestamp with time zone',true), ('announcement','expiresAt','timestamp with time zone',false),
 ('announcement_dismissal','userId','uuid',true), ('announcement_dismissal','announcementId','uuid',true),
 ('announcement_audit','content','jsonb',true), ('announcement_audit','revision','integer',true),
 ('user_notification','source','jsonb',true), ('user_notification','userId','uuid',true), ('user_notification','eventKey','character varying(200)',true),
 ('notification_outbox','payload','jsonb',true), ('notification_outbox','availableAt','timestamp with time zone',true),
 ('notification_outbox','leaseId','uuid',false), ('notification_outbox','attempts','integer',true)
)
SELECT e.table_name || '.' || e.column_name AS missing FROM expected e WHERE NOT EXISTS (
 SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass(e.table_name) AND a.attname = e.column_name
 AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod) = e.data_type AND a.attnotnull = e.not_null
)
UNION ALL
SELECT name FROM (VALUES
 ('announcement','uq_announcement_scope'), ('announcement','ck_announcement_interval'),
 ('announcement_dismissal','uq_announcement_dismissal'), ('announcement_dismissal','fk_announcement_dismissal_scope'),
 ('announcement_audit','fk_announcement_audit_scope'), ('announcement_audit','uq_announcement_audit_revision'),
 ('user_notification','uq_user_notification_event'), ('notification_outbox','uq_notification_outbox_event'),
 ('notification_outbox','ck_notification_outbox_state')
) AS required(table_name,name) WHERE NOT EXISTS (
 SELECT 1 FROM pg_constraint c WHERE c.conrelid = to_regclass(required.table_name) AND c.conname = required.name AND c.convalidated
);
