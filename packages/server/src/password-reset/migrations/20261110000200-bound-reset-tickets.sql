ALTER TABLE password_reset ADD COLUMN IF NOT EXISTS "userId" uuid, ADD COLUMN IF NOT EXISTS "tenantId" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_password_reset_bound_token" ON password_reset (token) WHERE "userId" IS NOT NULL;
-- Legacy mail links doubled as access JWTs. Retain their fingerprints for rejection by access-token consumers.
-- Older replicas may still insert JWTs during rollout. Never keep usable credentials in new rows.
CREATE OR REPLACE FUNCTION fingerprint_legacy_password_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.token := encode(sha256(convert_to(NEW.token, 'UTF8')), 'hex');
    RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS fingerprint_legacy_password_reset ON password_reset;
CREATE TRIGGER fingerprint_legacy_password_reset BEFORE INSERT OR UPDATE OF token ON password_reset
FOR EACH ROW WHEN (NEW."userId" IS NULL AND NEW.token LIKE '%.%.%') EXECUTE FUNCTION fingerprint_legacy_password_reset();
UPDATE password_reset SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
WHERE "userId" IS NULL AND token LIKE '%.%.%';

-- A previously consumed ticket may survive only in a rendered reset email. Preserve its
-- revocation fingerprint, then redact just the credential in that template's archived links.
CREATE OR REPLACE FUNCTION redact_legacy_password_reset_mail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    pattern CONSTANT text := '(/auth/reset-password[?]token=)(eyJ[A-Za-z0-9_-]+[.]eyJ[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+)';
BEGIN
    IF EXISTS (SELECT 1 FROM email_template WHERE id = NEW."emailTemplateId" AND name = 'password/html') THEN
        INSERT INTO password_reset (email, token)
        SELECT NEW.email, fingerprint FROM (
            SELECT DISTINCT encode(sha256(convert_to(match[2], 'UTF8')), 'hex') AS fingerprint
            FROM regexp_matches(NEW.content, pattern, 'g') AS match
        ) links
        WHERE NOT EXISTS (SELECT 1 FROM password_reset ticket WHERE ticket."userId" IS NULL AND ticket.token = fingerprint);
        NEW.content := regexp_replace(NEW.content, pattern, '\1[redacted]', 'g');
    END IF;
    RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS redact_legacy_password_reset_mail ON email_sent;
CREATE TRIGGER redact_legacy_password_reset_mail BEFORE INSERT OR UPDATE OF content ON email_sent
FOR EACH ROW WHEN (NEW.content LIKE '%/auth/reset-password?token=eyJ%') EXECUTE FUNCTION redact_legacy_password_reset_mail();
-- Apply the same archive policy to existing mail as to mail from replicas still on the old version.
UPDATE email_sent mail SET content = mail.content FROM email_template template
WHERE template.id = mail."emailTemplateId" AND template.name = 'password/html'
    AND mail.content LIKE '%/auth/reset-password?token=eyJ%';
