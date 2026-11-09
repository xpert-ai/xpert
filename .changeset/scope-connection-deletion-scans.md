---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Scope organization-owned connection deletion checks to their organization while retaining tenant-wide checks for tenant-owned connections. Traverse configuration JSON once against the collected model IDs instead of rescanning it for every saved model binding.
