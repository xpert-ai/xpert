CREATE TABLE IF NOT EXISTS business_area_access_grant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
 "organizationId" uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
 "businessAreaId" uuid NOT NULL REFERENCES business_area(id) ON DELETE CASCADE,
 "subjectType" varchar(20) NOT NULL,
 "userId" uuid REFERENCES "user"(id) ON DELETE CASCADE,
 "userGroupId" uuid REFERENCES user_group(id) ON DELETE CASCADE,
 role varchar(20) NOT NULL,
 "createdById" uuid REFERENCES "user"(id), "updatedById" uuid REFERENCES "user"(id),
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "CHK_business_area_grant_subject" CHECK (
  ("subjectType" = 'user' AND "userId" IS NOT NULL AND "userGroupId" IS NULL) OR
  ("subjectType" = 'user_group' AND "userGroupId" IS NOT NULL AND "userId" IS NULL)
 ),
 CONSTRAINT "CHK_business_area_grant_role" CHECK (role IN ('consumer', 'publisher', 'domain_admin'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_business_area_grant_user" ON business_area_access_grant ("tenantId", "organizationId", "businessAreaId", "userId") WHERE "userId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_business_area_grant_group" ON business_area_access_grant ("tenantId", "organizationId", "businessAreaId", "userGroupId") WHERE "userGroupId" IS NOT NULL;
