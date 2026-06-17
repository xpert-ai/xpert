---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
---

Add missing `publishAt` column to `SkillPackage` entity and `ISkillPackage` contract so that shared skills published to the org market are persisted and queryable by the `workspace-public` provider.
