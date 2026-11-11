---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Persist the existing Project Task review candidate binding in a nullable JSONB column and protect it from ordinary task mutations. Add an idempotent migration and deployment schema check; review dispatch and acceptance orchestration remain separate.
