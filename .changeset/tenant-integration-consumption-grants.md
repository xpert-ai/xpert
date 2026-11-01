---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-ui': patch
---

Add explicit tenant integration grants for selected or all organizations, separated into configuration, invocation, and Assistant binding purposes. Enforce the same policy during discovery and runtime consumption without exposing credentials or widening management access.

Provide tenant authorization controls, scope labels, and disabled unavailable selections in Cloud. Supply the persisted Assistant scope when publishing triggers, and expose usage-aware integration reads to plugins.

Coordinate deployment with the WeCom plugin update for xpert-ai/xpert#1269. Apply the integration sharing schema through the normal schema-sync deployment gate; existing tenant integrations remain private until an administrator grants access.
