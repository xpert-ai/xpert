---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Avoid repeated ancestor and execution scans during data-retention previews. Resolve protected checkpoint IDs once and reuse candidate eligibility for totals and the selected batch, preserving cleanup protections, scope matching, and execution-time rechecks.
