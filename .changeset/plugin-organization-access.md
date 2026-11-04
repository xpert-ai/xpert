---
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Restore plugin browsing and organization-scoped management for authorized authors. Validate organization access and uninstall targets while preserving system, tenant, marketplace administration and restart restrictions. Scope plugin convergence reads to the requesting organization and avoid displaying a zero installed count when loading fails.
