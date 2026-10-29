---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Preserve upstream model service failures as gateway errors instead of execution
permission denials. Retain upstream 5xx and rate-limit status with sanitized
retry and request identifiers, while keeping authorization and metering behavior.
