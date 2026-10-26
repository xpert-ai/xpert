---
'@xpert-ai/contracts': patch
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Reconcile persisted plugin restart failures against the current server generation, retain operation identities across failures, and isolate browser state by authenticated scope. Fence restart publication atomically so stale tabs cannot replace newer desired plugin versions. Preserve exact runtime admission checks and server-owned setup activation.

Separate browser persistence, schema validation, and restart reconciliation policy. Report invalid or unavailable storage explicitly, preserve in-memory state when persistence fails, and verify scoped records before removing legacy cache entries during migration.
