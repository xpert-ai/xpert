---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Reject group sends that target Assistants requiring an unbound Project before persisting messages or delivery receipts. Return a typed `GROUP_PROJECT_REQUIRED` error with the affected participant IDs, while preserving accepted-message retries and allowing the original request after Project binding.
