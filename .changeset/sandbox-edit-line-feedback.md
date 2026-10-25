---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Report old/new argument line counts and actual file additions/deletions after sandbox edits. Compute line differences in the existing sandbox process without Git or temporary files, with bounded comparison work for broad rewrites. Unchanged replacements succeed with a zero diff. Sequential batches retain per-edit feedback and partial progress; unavailable statistics never prevent editing.
