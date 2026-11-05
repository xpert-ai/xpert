---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Preserve authenticated user provenance when dispatching knowledge pipelines so background workers restore current permissions before workspace authorization. Bind the marker to the initiating user and target scope while preserving Assistant and delegated credential boundaries, permission revocation and scoped task failure callbacks.
