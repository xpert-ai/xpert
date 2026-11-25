---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-ai': patch
---

Require an explicit runId for pipeline cancellation instead of expectedRevision. Pin the confirmation dialog to the observed run, preserve authorization and request idempotency, and report a historical run's terminal state without touching a newer run. API and UI consumers must update together; revision-only cancellation requests are rejected. Retry and next-round revision checks remain unchanged.
