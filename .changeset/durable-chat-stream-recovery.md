---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Persist complete chat recovery snapshots before trimming Redis events, archive abandoned stream tails before expiry, and await final message persistence before completion. Create recovery tables through the existing schema-sync flow and trim committed prefixes automatically. Deploy with matching SDK and ChatKit snapshot recovery support.
