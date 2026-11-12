---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Allow signed-in Project managers to raise an existing Pipeline native-model token ceiling through an audited, revision-checked and idempotent management API. Preserve historical usage, unknown reservations, call limits and decisions, and apply the effective ceiling to admission and status reads. This budget covers host-native LLM requests with persisted Pipeline ancestry; it does not cover Computer CLI usage or unrelated coordinator continuations.
