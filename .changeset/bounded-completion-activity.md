---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Preserve an optional bounded resource idle window when a live activity owner completes. Use an atomic Redis transition so repeated cleanup cannot extend retention or restore expired activity. Preserve other owners and reserve the internal idle marker.
