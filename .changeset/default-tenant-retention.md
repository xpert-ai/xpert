---
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Manage data retention exclusively from the default tenant and apply its cleanup switches and retention periods to all tenants. Ignore other tenants' previous retention overrides, preserve conversation references and pending settlements, and retain model usage facts when removing expired call records. Only default-tenant SuperAdmins can change these global policies; missing or disabled default policies do not trigger cleanup.

Keep retention parameters out of the generic tenant settings editor and only display saved changes after the request succeeds. Failed saves preserve the original value and editable draft and show an error.
