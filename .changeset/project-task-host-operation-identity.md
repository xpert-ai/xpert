---
'@xpert-ai/server-ai': patch
---

Generate Project Task dispatch and decision idempotency keys in the host tool layer from scoped tool-call identity instead of requiring model-generated UUIDs. Preserve keys across replay and Agent run reconstruction, reject missing identity and model overrides, and retain existing service conflict checks and durable recovery records.
