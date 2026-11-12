---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Include scoped direct-child summaries in Project Task reads so coordinating Assistants can inspect a task hierarchy without recursively loading execution results. Preserve existing project authorization and per-invocation result access checks.
