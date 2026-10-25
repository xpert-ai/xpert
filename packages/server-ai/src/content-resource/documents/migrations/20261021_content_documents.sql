-- PostgreSQL. Deploy together with the platform SDK and Markdown editor plugin.
-- No legacy content is overwritten: conversion is an authorized, resumable operation on opening a page.
BEGIN;
CREATE TABLE IF NOT EXISTS content_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "createdById" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "projectId" uuid NOT NULL, path text NOT NULL, title varchar(200) NOT NULL, "modelKey" varchar(160) NOT NULL,
  "schemaVersion" integer NOT NULL DEFAULT 1, epoch integer NOT NULL DEFAULT 1, "collaborationId" uuid,
  "headRevisionId" uuid, "fileHash" varchar(64) NOT NULL, sequence integer NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'ready', "sourceProvider" varchar(160) NOT NULL, "sourceId" varchar(256) NOT NULL,
  "projectionPending" boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_content_document_active_path" ON content_document ("tenantId", "organizationId", "projectId", path) WHERE status <> 'deleted';
CREATE TABLE IF NOT EXISTS content_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "createdById" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "resourceId" uuid NOT NULL, "parentId" uuid, "mutationId" varchar(160) NOT NULL,
  hash varchar(64) NOT NULL, "stateHash" varchar(64) NOT NULL, "baseHash" varchar(64) NOT NULL,
  epoch integer NOT NULL, sequence integer NOT NULL, label varchar(200) NOT NULL, status varchar(16) NOT NULL DEFAULT 'prepared',
  UNIQUE ("tenantId", "organizationId", "resourceId", "mutationId")
);
CREATE TABLE IF NOT EXISTS content_proposal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "createdById" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "resourceId" uuid NOT NULL, "mutationId" uuid NOT NULL, epoch integer NOT NULL, sequence integer NOT NULL,
  "blockId" varchar(160) NOT NULL, before text NOT NULL, after text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending', "assistantId" uuid, "preparedUpdate" text,
  UNIQUE ("tenantId", "organizationId", "resourceId", "mutationId")
);
CREATE TABLE IF NOT EXISTS content_comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "createdById" uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "resourceId" uuid NOT NULL, "blockId" varchar(160), epoch integer NOT NULL, body text NOT NULL, resolved boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS "IDX_content_comment_resource" ON content_comment ("tenantId", "organizationId", "resourceId");
CREATE TABLE IF NOT EXISTS content_location_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, "organizationId" uuid NOT NULL REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "createdById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "updatedById" uuid REFERENCES "user"(id) ON DELETE RESTRICT, "projectId" uuid NOT NULL,
  input jsonb NOT NULL, documents jsonb NOT NULL, status varchar(16) NOT NULL DEFAULT 'prepared'
);
COMMIT;
