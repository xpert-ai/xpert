---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Keep coding CLI streams alive during long gaps without visible output by emitting
empty Chat Completion deltas and sequenced Responses status events. Preserve real
provider activity deadlines, usage accounting, cancellation and stream backpressure.
Verify compatibility with pinned Qwen and Codex clients using offline providers.
