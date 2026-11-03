---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow authenticated users to read scoped tag definitions while retaining tag management permissions. Recover tag selectors and workspace rendering after request failures, with retry feedback and cache invalidation on scope changes. Add HTTP isolation and frontend regression coverage for #1327.
