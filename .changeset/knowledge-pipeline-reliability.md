---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-ui': patch
---

Restore knowledge pipeline source selection and previews, refresh documents immediately after saving, and track background processing failures. Persist imported documents and task bindings atomically, and prevent stale failure callbacks from overwriting a newer document execution.
