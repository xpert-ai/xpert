---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Allow Project binding after a group Assistant's first attempt failed without accepting input. Require an empty runtime with finalized failed receipts and failed executions, reject active work or existing Project bindings, and preserve the original failure records.
