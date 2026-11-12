---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Protect bound review tasks from generic hierarchy edits and completion, and require coordinated summaries to complete through their owning acceptance flow. Recheck persisted ownership under the project lock and preserve ordinary scheduling and task updates.
