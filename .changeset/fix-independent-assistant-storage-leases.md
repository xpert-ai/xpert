---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Prevent independent background Assistant tasks from inheriting the caller's workspace storage lock leases during execution creation and subscription. Preserve authorization and invocation context, idempotent dispatch, and stale-owner fencing so tasks can read and save results after the caller releases its lock.
