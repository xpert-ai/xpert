---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Reduce thread capability read overhead by loading only the published graph and execution settings needed for recovery validation, without expanding workflow collection relations. Preserve runtime access checks, graph revision compatibility, and complete retry checkpoint validation.
