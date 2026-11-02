---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Expose optional Handoff enqueueOnce for producers recovering from an ambiguous enqueue acknowledgement. Scope job identities by tenant, organization, message type and message ID, and retain completed or failed ordinary queue jobs for at least 24 hours. Preserve existing enqueue behavior and controlled publication. Lark stale-follow-up recovery is the initial consumer.
