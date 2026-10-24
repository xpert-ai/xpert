---
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-core': patch
'@xpert-ai/contracts': patch
'@xpert-ai/desktop': patch
---

Withdraw API replicas from readiness-aware ingress before draining, refresh plugin admission independently of rollout bookkeeping, and expose validation and lease diagnostics. Preserve structured runtime errors in Desktop with bounded recovery for safe requests and clear recovered session errors. Compose deployments must route all API ingress through the new readiness-aware gateway.

Give admission monitoring an independent provider lifecycle, validate a configurable ingress propagation budget, and distinguish runtime completion from ingress acknowledgement.

Keep authenticated readiness independent of tenant settings, bound Redis cache reads and writes with database fallback, and stop queuing cache calls while timed-out operations remain pending.
