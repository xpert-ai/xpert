---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Register nested workflow executions before their tools start. Iterators now propagate cancellation and execution-control failures, and checkpoint replays use a fresh execution attempt while recovering nested calls under their original invocation IDs.
