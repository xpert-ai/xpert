---
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-ai': patch
---

Move ordinary user-input and Plan Mode behavior into the configured middleware. Register a fixed tool schema and use existing runtime state for prompts and response validation, without extending the plugin SDK context or injecting question-specific middleware during subgraph construction. Plan Mode requires the user-input capability, and configuration and publication reject unsupported Agent connections.
