---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add atomic acceptance and group-scoped placement of published Artifact grants, with authenticated source-management and conversation-scoped list, read, query and removal endpoints. Reuse the Artifact library viewer while keeping group references out of ordinary Project catalogs and retaining legacy source authorization.

Read integrity-checked fixed version bytes and revalidate grants, group membership, reference state and provider registration before releasing presentation results. Keep authoring Project identity separate from the group's runtime Project. Interactive queries require an explicit type allowlist and use the current viewer's data permissions; drafts, export and source file browsing are not exposed.
