---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow tool-owned public presentation policies to opt into validated immutable image attachments. Publish these references on normal tool lifecycle events without exposing private artifact payloads or image bytes.

Keep cached presentation declarations scoped to the execution, call ID and tool name so reused call IDs cannot inherit another execution's image opt-in.
