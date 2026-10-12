---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Expose HTTP API request counts and response-duration histograms by full registered route template, method, status, response type, and completion outcome. Track case-insensitive API paths and parameterized or aliased router mounts without retaining resolved request identifiers. Keep SSE and aborted responses separate, exclude scrapes and health checks, and provide a 500ms bucket for slow API request monitoring.
