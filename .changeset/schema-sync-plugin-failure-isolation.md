---
'@xpert-ai/xpert-api': patch
---

Keep schema-sync available when individual plugins fail to load, retaining successful plugin entities and existing tables for unavailable plugins. Continue to stop deployment on plugin discovery failures, startup timeouts, invalid entity metadata and database migration errors.
