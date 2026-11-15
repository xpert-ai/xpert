---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/plugin-coding-project': patch
---

Pin confirmed invocation completion independently of result delivery recovery. Reduce repeated coding delivery context, clarify node execution statistics, and guide feedback-linked rework and evidence-based final reporting.

Historical invocation snapshots without a confirmed completion timestamp leave runtime timing unavailable instead of deriving it from later metadata updates.
