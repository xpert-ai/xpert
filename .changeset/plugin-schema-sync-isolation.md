---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Restrict plugin installation schema synchronization to the current plugin's tables and owned join tables while retaining reference metadata for foreign keys. Prevent runtime entity registration from synchronizing the whole database, so installing one plugin does not alter host tables or unrelated plugins such as DOCX Editor.
