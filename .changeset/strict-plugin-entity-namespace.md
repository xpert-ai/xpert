---
'@xpert-ai/xpert-api': patch
---

Require entity-owning plugins to declare an explicit artifact namespace and system/tenant installation level at startup and installation. Reject namespace and physical-table ownership conflicts, including incompatible scoped versions, before registration; remove the legacy unnamespaced DDL fallback.
