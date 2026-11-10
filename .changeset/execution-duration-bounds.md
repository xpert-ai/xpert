---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Separate ordinary execution duration from the tenant ceiling while preserving explicit legacy policies. Pin grants to a bounded requested duration, keep lease periods within that duration, and expose the remaining authorization lifetime for trusted launchers.
