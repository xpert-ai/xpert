---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Preserve upstream model service failures as gateway errors instead of execution
permission denials. Retain upstream request errors, 5xx and rate-limit status with
sanitized retry and request identifiers. Keep provider/proxy credential failures
separate from execution authorization, without changing metering behavior.
