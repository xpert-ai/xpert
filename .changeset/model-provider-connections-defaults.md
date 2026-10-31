---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/headless-ui': patch
'@xpert-ai/xpert-api': minor
'@xpert-ai/xpert-ui': minor
---

Manage model providers through named connections, typed model catalogs, compact configuration dialogs, and an inline plugin marketplace. Keep connection identity and model type visible in Assistant selection and membership configuration.

Separate default model purposes from provider connections, add defaults for common media and retrieval model types, and migrate valid legacy defaults without changing credentials or existing Assistant bindings. Retain compatibility reads for unmigrated defaults.

Add previewable, reversible bulk model replacement for editable Assistant drafts, and validate destination parameters when switching models so incompatible settings are not retained.
