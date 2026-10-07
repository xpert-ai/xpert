---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
---

Add the Conversation Map data and action services with authorized Assistant-family pagination, visible message search, branch-aware summaries, and typed branch titles. Reuse existing conversation creation, rename, branch, and navigation services, and return the existing side chat on request retries even after its source starts another run.
