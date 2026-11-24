---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Defer new Runtime result continuations during process drain or module destruction while retaining durable, unstarted reservations for recovery. Preserve the original execution type on retry and paused-run resumption. Classify an unknown execution outcome as service unavailability instead of authorization denial, without automatically restarting an uncertain run.
