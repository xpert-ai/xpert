SELECT 'password_reset.account_binding' AS missing
WHERE (SELECT count(*) FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name = 'password_reset' AND column_name IN ('userId','tenantId') AND data_type = 'uuid') <> 2
UNION ALL SELECT 'password_reset.legacy_fingerprint'
WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('password_reset')
    AND tgname = 'fingerprint_legacy_password_reset' AND tgenabled IN ('O','A'))
UNION ALL SELECT 'password_reset.mail_archive'
WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('email_sent')
    AND tgname = 'redact_legacy_password_reset_mail' AND tgenabled IN ('O','A'))
UNION ALL SELECT 'password_reset.bound_token_index'
WHERE NOT EXISTS (SELECT 1 FROM pg_index WHERE indrelid = to_regclass('password_reset')
    AND indexrelid = to_regclass('"UQ_password_reset_bound_token"') AND indisunique AND indisvalid);
