---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Preserve new messages sent after interrupted tool runs by checkpointing input identities and committing their consumption with model history. Keep new Send, checkpoint Resume/Retry, and tool/model loops distinct; preserve completed tool results and record unknown outcomes for missing results without rerunning old tools. Add graph-level regression coverage for interruption, repeated input text, recovery, middleware, and delegated input scope.
