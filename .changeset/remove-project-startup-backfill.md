---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Remove the legacy Project migration service and its automatic startup backfill. API startup no longer scans existing Projects, rewrites legacy membership or task state, indexes old assets, or disables enabled automations. Keep normal Project creation, content initialization and plan provisioning in their existing business services.

Deprecate `project.members` in favor of `memberships` and the Project membership API. Legacy membership data is not migrated or used as an authorization fallback.
