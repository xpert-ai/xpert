---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/desktop': patch
---

Refresh the Cloud assistant sidebar after successful template installation. Preserve installation history while reporting current target availability, disable opening deleted or inaccessible assistants in Cloud and Desktop, and clear stale opening errors when starting another installation. Keep interrupted-request recovery and idempotency intact.
