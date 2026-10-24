-- Resource ACL reuses artifact.resourceId. It does not determine ownership or visibility.
ALTER TABLE "artifact" ADD COLUMN IF NOT EXISTS "authorizationProviderKey" varchar NULL;
