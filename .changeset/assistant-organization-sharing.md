---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': minor
'@xpert-ai/xpert-ui': minor
---

Add organization member sharing and scoped user-group authorization for Assistants. Separate resource sharing from organization group management, enforce active organization membership and runtime-only grants, and keep access changes consistent across published versions.

Use the existing Zard UI theme for the sharing page and hide group authorization when the account cannot view organization user groups.
