---
'@xpert-ai/server-ai': patch
---

Bind an enabled template sub-agent's unspecified Sandbox provider to the parent Assistant's configured provider before dependency validation and execution snapshotting. Preserve explicit template providers and reject unavailable providers before creating task state.
