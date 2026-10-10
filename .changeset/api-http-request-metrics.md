---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Expose HTTP API request counts and response-duration histograms by registered route, method, status, response type, and completion outcome. Keep SSE and aborted responses separate, exclude scrapes and health checks, and provide a 500ms bucket for slow API request monitoring.
