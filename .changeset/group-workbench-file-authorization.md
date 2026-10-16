---
'@xpert-ai/xpert-api': patch
---

Authorize native Workbench file operations for active group members through the persisted group/Assistant runtime binding. Recheck credential audience, tenant and organization scope, expiry and live membership on each file request, retaining Assistant file and Project write authorization and ordinary conversation isolation.

Deny non-Project group runtime environment file access until a live environment sharing policy can authorize the exact binding and owner; a persisted sandbox environment reference alone does not grant file access.
