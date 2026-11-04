---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/nsjail-runner': patch
---

Return explicit JSON null from tenant onboarding before initialization. Validate shared workspace directory ownership as the configured workspace identity when the privileged NsJail Runner sees caller-dependent ownership, preserving non-root execution and directory protection.
