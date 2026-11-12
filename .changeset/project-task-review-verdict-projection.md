---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Populate execution-level review verdicts from settled, matching Invocation reports. Clear stale verdicts when the Invocation is unavailable or the report does not match its pinned candidate; preserve business acceptance as a separate decision.
