---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Fill task responsibility from the executing Assistant automatically: use the selected group expert, or the current Assistant for an unassigned external Runtime task. Default creation to the current Assistant and commit dispatch assignment with the attempt while preserving revision and replay checks.

Normalize historical group experts to their current Assistant identity for task responsibility while preserving the selected Runtime version.
