---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-core': patch
---

Validate declared TypeORM and Nest ORM peers against the running host, reject private runtime ORM dependencies, and link compatible peers before loading installed plugins. Preserve shared DataSource identity and Nest entity registration across staged archive and source installations.
