---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Preserve thread activity SSE updates when Nest has already flushed response headers, while retaining sanitized diagnostics for failed reads.
