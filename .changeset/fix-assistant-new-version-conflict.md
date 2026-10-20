---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Prevent new-version Assistant publication from cascading a version-number update into its primary Agent and falsely reporting AgentOutdated when the Agent inherits its model. Preserve stale-Agent checks, transactional version backups and rollback, and cover these paths with PostgreSQL regression tests.
