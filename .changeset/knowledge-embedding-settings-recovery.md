---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Keep saved embedding targets visible independently of active vector indices. Enforce model batch limits at the host boundary, expose rebuild errors and batch correction in the current knowledge settings dialog, and retry the saved target without replacing active vectors before success. Protect rebuild state from configuration readback and cover failure, refresh, retry and stale-task isolation with nonempty embedding inputs.
