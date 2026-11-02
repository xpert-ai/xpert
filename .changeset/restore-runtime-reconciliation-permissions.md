---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Restore current role permissions for background result delivery and attached task control so authorized failed invocations can settle. Preserve safe authorization failure reasons without exposing exception payloads, and retain revocation and target access checks.
