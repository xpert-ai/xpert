---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Preserve registered tool titles, icons and activity declarations on failure events, including validation errors before a tool start event. Prefer the failing tool's public error declaration over inherited parent metadata, and keep display metadata scoped to the matching tool.
