---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/plugin-sdk': patch
---

Expose an installation-bound asynchronous PluginContext.readConfig() method that reads current configuration from the database on demand, without background polling. Preserve scope and runtime artifact boundaries and fail explicitly on unavailable or invalid configuration. The synchronous config snapshot remains compatible with existing plugins.
