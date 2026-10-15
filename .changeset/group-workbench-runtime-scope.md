---
'@xpert-ai/contracts': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add an optional group identifier to the Workbench runtime scope and resolve group views through the authorized group context API. Keep views bound to the resolved Assistant and conversation, ignore stale responses when switching groups, and avoid falling back to personal views while group context is loading.
