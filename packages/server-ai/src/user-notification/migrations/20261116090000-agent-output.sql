CREATE TABLE agent_output_message (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "userId" uuid NOT NULL,
 "bindingId" uuid NOT NULL, "bindingRevision" int NOT NULL, plugin varchar NOT NULL, kind varchar NOT NULL,
 "outputKey" varchar NOT NULL, reference jsonb NOT NULL
);
CREATE UNIQUE INDEX uq_agent_output_message ON agent_output_message ("tenantId","organizationId",plugin,kind,"outputKey","userId");
CREATE TABLE agent_output_preference (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "userId" uuid NOT NULL,
 kind varchar NOT NULL, channel varchar NOT NULL, enabled boolean NOT NULL, revision int NOT NULL,
 "enabledSince" timestamptz NOT NULL, quiet jsonb, "integrationId" uuid, "targetDigest" varchar
);
CREATE UNIQUE INDEX uq_agent_output_preference ON agent_output_preference ("tenantId","organizationId","userId",kind,channel);
CREATE TABLE agent_output_delivery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "userId" uuid NOT NULL,
 channel varchar NOT NULL, kind varchar NOT NULL, "groupKey" varchar NOT NULL, "preferenceRevision" int NOT NULL,
 state varchar NOT NULL, "attemptId" uuid, "attemptedAt" timestamptz, "providerMessageId" varchar, reason varchar
);
CREATE INDEX ix_agent_output_batch ON agent_output_delivery ("groupKey",state);
CREATE TABLE agent_output_member (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "messageId" uuid NOT NULL REFERENCES agent_output_message(id) ON DELETE CASCADE,
 "deliveryId" uuid NOT NULL REFERENCES agent_output_delivery(id) ON DELETE CASCADE, channel varchar NOT NULL,
 included boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_agent_output_member ON agent_output_member ("messageId",channel);
CREATE INDEX ix_agent_output_members ON agent_output_member ("deliveryId");
