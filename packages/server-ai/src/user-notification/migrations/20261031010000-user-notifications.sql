CREATE TABLE IF NOT EXISTS announcement (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), title varchar(160) NOT NULL, body text NOT NULL,
 category varchar(32) NOT NULL, severity varchar(16) NOT NULL, clients jsonb NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'draft', revision integer NOT NULL DEFAULT 1,
 "startsAt" timestamptz NOT NULL, "expiresAt" timestamptz, action jsonb,
 "authorId" uuid NOT NULL REFERENCES "user"(id), "publisherId" uuid REFERENCES "user"(id),
 CONSTRAINT uq_announcement_scope UNIQUE ("tenantId", id),
 CONSTRAINT ck_announcement_status CHECK (status IN ('draft', 'published', 'withdrawn')),
 CONSTRAINT ck_announcement_revision CHECK (revision > 0),
 CONSTRAINT ck_announcement_interval CHECK ("expiresAt" IS NULL OR "expiresAt" > "startsAt"),
 CONSTRAINT ck_announcement_clients CHECK (jsonb_typeof(clients) = 'array' AND clients <@ '["web","desktop"]'::jsonb AND jsonb_array_length(clients) > 0)
);
CREATE INDEX IF NOT EXISTS ix_announcement_active ON announcement ("tenantId", status, "startsAt");
CREATE TABLE IF NOT EXISTS announcement_dismissal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "announcementId" uuid NOT NULL,
 CONSTRAINT fk_announcement_dismissal_scope FOREIGN KEY ("tenantId", "announcementId") REFERENCES announcement("tenantId", id) ON DELETE CASCADE,
 CONSTRAINT uq_announcement_dismissal UNIQUE ("tenantId", "userId", "announcementId")
);
CREATE TABLE IF NOT EXISTS announcement_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "announcementId" uuid NOT NULL,
 "actorId" uuid NOT NULL REFERENCES "user"(id), operation varchar(16) NOT NULL, revision integer NOT NULL, content jsonb NOT NULL,
 CONSTRAINT fk_announcement_audit_scope FOREIGN KEY ("tenantId", "announcementId") REFERENCES announcement("tenantId", id) ON DELETE CASCADE,
 CONSTRAINT uq_announcement_audit_revision UNIQUE ("announcementId", revision)
);
CREATE TABLE IF NOT EXISTS user_notification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "eventKey" varchar(200) NOT NULL, kind varchar(32) NOT NULL, source jsonb NOT NULL, "readAt" timestamptz,
 CONSTRAINT uq_user_notification_event UNIQUE ("tenantId", "userId", "eventKey")
);
CREATE INDEX IF NOT EXISTS ix_user_notification_inbox ON user_notification ("tenantId", "userId", "createdAt" DESC, id DESC);
CREATE TABLE IF NOT EXISTS notification_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "userId" uuid REFERENCES "user"(id) ON DELETE CASCADE,
 "eventKey" varchar(200) NOT NULL, payload jsonb NOT NULL, state varchar(16) NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0, "availableAt" timestamptz NOT NULL, "leaseUntil" timestamptz, "leaseId" uuid,
 "sentAt" timestamptz, "lastError" varchar(64),
 CONSTRAINT uq_notification_outbox_event UNIQUE ("tenantId", "eventKey"),
 CONSTRAINT ck_notification_outbox_state CHECK (state IN ('pending', 'sent', 'blocked'))
);
CREATE INDEX IF NOT EXISTS ix_notification_outbox_due ON notification_outbox (state, "availableAt");

INSERT INTO role_permission (id, "createdAt", "updatedAt", "tenantId", "roleId", permission, enabled)
SELECT gen_random_uuid(), now(), now(), r."tenantId", r.id, 'ANNOUNCEMENT_MANAGE', true
FROM role r WHERE r.name = 'SUPER_ADMIN' AND NOT EXISTS (
 SELECT 1 FROM role_permission p WHERE p."roleId" = r.id AND p."tenantId" = r."tenantId" AND p.permission = 'ANNOUNCEMENT_MANAGE'
);
