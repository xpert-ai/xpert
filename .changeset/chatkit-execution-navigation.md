---
'@xpert-ai/contracts': patch
'@xpert-ai/xpert-ui': patch
---

Support the assistant.execution Workbench navigation target and forward embedded ChatKit commands through the current view's authorized host handlers when local navigation is unavailable. Pass exact execution focus and a fresh request ID into the authorized conversation so repeated selections reopen the same record. Preserve the existing agent.workbench.fixed slot and conversation navigation compatibility.
