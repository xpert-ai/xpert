---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
---

Refresh execution-control capabilities independently from plugin business readiness and validate all registered control schemas from one fresh catalog query. Preserve capability expiry and fail closed when validation is unavailable. Check stable running invocations every five seconds while retaining fresh authorization on each observation and the existing cadence for observed control changes.
