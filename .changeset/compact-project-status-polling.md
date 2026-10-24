---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Reduce project-task polling work with a scoped run-status endpoint that selects lifecycle fields and business outcomes without loading execution payloads. Limit task-graph execution queries to timing and status fields.

Pause project-task refreshes while their Workbench view or browser tab is hidden and resume when visible. Deduplicate avatars by content version and omit assets already cached by the client, preserving task state, access checks, and retry behavior.
