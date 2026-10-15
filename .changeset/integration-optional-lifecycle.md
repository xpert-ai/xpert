---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Allow integrations without a registered strategy, including GitHub, to be updated and deleted. Reuse the existing scoped registry lookup for optional validation and lifecycle hooks, while preserving lookup errors and failures from registered hooks. Required strategy operations remain unchanged.
