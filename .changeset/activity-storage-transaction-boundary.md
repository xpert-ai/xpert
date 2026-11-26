---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Prepare execution activity output files outside database transactions, then atomically commit activity rows and their source cursor after rechecking the captured checkpoint. Batch database reads and inserts, preserve idempotent updates and first sequence numbers, and freeze expired activity before reclaiming its private volume without holding a database connection during file I/O. Reclaim late output that recreates an expired volume, keep failed cleanup retryable, and preserve the original storage error.
