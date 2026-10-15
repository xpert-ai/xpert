---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow built-in integrations such as GitHub to be updated and deleted without a registered strategy. Block mutations when a plugin provider is unavailable, with a localized error, and preserve failures from configured lifecycle hooks. Add scoped optional strategy lookup without changing required lookup behavior.
