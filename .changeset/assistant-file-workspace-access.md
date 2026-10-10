---
'@xpert-ai/server-ai': patch
---

Authorize Assistant runtime files through the exact published Assistant's access policy, independently of authoring workspace membership. Users granted access through a user group can read, upload, modify and delete shared Assistant files; user-scoped files remain isolated to the authenticated user. Revalidate access across runtime file entry points while preserving Studio authoring checks and Project access rules.

Move conversation runtime file operations under `/ai/conversations/:id/workspace/*` to avoid colliding with the parsed attachment listing at `/ai/conversations/:id/files`. Preserve legacy single-file routes and deploy alongside the matching `@xpert-ai/xpert-sdk` Workbench route update. Document the two workspace concepts and verify collaborative access with local accounts.
