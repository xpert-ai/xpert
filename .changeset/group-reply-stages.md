---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Distinguish partial and final group replies with an explicit replyStage. Only a committed final tool reply completes the sender's answer and suppresses the last automatic answer for the same request. Preserve progress, collaboration, retries and legacy final-reply semantics.
