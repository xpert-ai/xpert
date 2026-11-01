---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Synchronize persisted built-in templates using SHA-256 baselines. Update unmodified assets and merge catalog descriptors by locale and ID while preserving custom templates and local overrides. Add atomic writes, interrupted-update recovery, a shared initialization/export lock, and deployment guidance for legacy installations without hash history.
