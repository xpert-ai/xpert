---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Persist compatibility chat output in Redis and scoped display snapshots so ChatKit can rejoin an active run. Establish the execution lease before graph execution and bind replay identifiers to the admitted conversation and run.
