---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Preserve reasoning and cache token details in priced LLM receipts so Model Gateway can validate and settle reasoning-model calls. Keep usage with unavailable or inconsistent pricing pending settlement instead of treating it as a successful zero-point charge. Add regression coverage from the SDK callback through gateway validation and idempotent membership ledger settlement.
