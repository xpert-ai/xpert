---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-core': patch
---

Persist MCP execution ownership before sending work, redeliver original-generation control and retain settlement until handlers and attached work actually finish. Add a negotiated control receipt, unique task admission, non-replaying input continuation, and conversation pause/termination bridges. Include conservative migration for legacy tasks.
