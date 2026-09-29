-- Apply before enabling Desktop Shell. Additive migration; existing platform data is unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS desktop_shell_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "installationId" uuid NOT NULL, name varchar(100) NOT NULL, platform varchar(20) NOT NULL,
  shell varchar(256) NOT NULL, cwd text NOT NULL, enabled boolean NOT NULL DEFAULT false,
  "credentialHash" varchar(64) NOT NULL, "credentialExpiresAt" timestamptz NOT NULL,
  "connectionEpoch" uuid, "leaseExpiresAt" timestamptz,
  UNIQUE ("tenantId", "organizationId", "userId", "installationId")
);
CREATE TABLE IF NOT EXISTS desktop_shell_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "deviceId" uuid NOT NULL REFERENCES desktop_shell_device(id) ON DELETE CASCADE,
  "assistantId" uuid NOT NULL, "threadId" uuid, enabled boolean NOT NULL DEFAULT true, "expiresAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS desktop_shell_grant_device ON desktop_shell_grant ("deviceId", enabled);
CREATE TABLE IF NOT EXISTS desktop_shell_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "deviceId" uuid NOT NULL REFERENCES desktop_shell_device(id) ON DELETE CASCADE,
  "grantId" uuid NOT NULL REFERENCES desktop_shell_grant(id), "threadId" uuid NOT NULL,
  "runId" uuid NOT NULL, "toolCallId" varchar(255) NOT NULL, "argsHash" varchar(64) NOT NULL,
  command text NOT NULL, cwd text NOT NULL, "timeoutSec" integer NOT NULL, deadline timestamptz NOT NULL,
  state varchar(24) NOT NULL DEFAULT 'pending', output jsonb NOT NULL DEFAULT '[]',
  "outputBytes" integer NOT NULL DEFAULT 0, seq integer NOT NULL DEFAULT 0,
  "exitCode" integer, signal varchar(32), truncated boolean NOT NULL DEFAULT false, "errorCode" varchar(80),
  UNIQUE ("tenantId", "runId", "toolCallId")
);
CREATE INDEX IF NOT EXISTS desktop_shell_operation_device ON desktop_shell_operation ("deviceId", state);
COMMIT;
