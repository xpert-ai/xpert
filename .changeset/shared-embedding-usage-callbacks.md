---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-ai': patch
---

Export OpenAICompatibleEmbeddings for model plugins to reuse authoritative per-request usage callbacks. Preserve transport batching/retry behavior, capture provider usage before vectors discard it, and keep accounting callback failures outside the transport retry loop.
