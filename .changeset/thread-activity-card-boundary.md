---
'@xpert-ai/server-ai': patch
---

Separate generic thread activity discovery from project task card projection through a typed CQRS command. Keep task permissions, invocation ownership checks and review verdict interpretation in the project module without changing the activity stream or card protocol.
