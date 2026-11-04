---
'@xpert-ai/server-config': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Enable System Integration and Agent Marketplace by default for newly initialized tenants in development and production. Honor explicit `FEATURE_INTEGRATION=false` and `FEATURE_XPERT_MARKETPLACE=false` overrides, while preserving existing tenant and organization feature selections.
