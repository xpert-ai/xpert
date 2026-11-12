---
'@xpert-ai/xpert-api': patch
---

Add cold checkpoints and resumable state recovery for explicitly exclusive local development instances. Preserve pre-restore state and source/credentials, reject changed bindings or data conflicts, and block service startup while a restore is incomplete. Report environment recovery separately from plugin acceptance.
