---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-ui': patch
---

Use a dedicated direct creation path for group Projects while retaining application-managed provisioning. Recover interrupted content initialization without overwriting owner edits or Project classification, and reject entity-managed types, unavailable types and conflicting existing Projects from direct creation.

Name the shared implementation `ensureProject` in `project-provisioning.ts`. Clarify that an `updated` result includes initialization recovery for an existing Project and does not necessarily indicate metadata changes.
