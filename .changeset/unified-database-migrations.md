---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/server-config': patch
---

Extend the existing schema-sync deployment job with TypeORM SQL migrations. Ordinary tables still synchronize from entities; explicitly SQL-managed tables are excluded. Package module-local SQL and checks, preserve migration checksums, support verified baseline adoption, and serialize host/plugin DDL using a shared PostgreSQL lock.

Disable API startup DDL in development as well as production. Share installed plugin mounts with Compose migration jobs and fail on incomplete plugin registration. Preserve legitimate undispatched ModelExecution calls during baseline adoption, with regression coverage for independently reconstructed legacy databases.
