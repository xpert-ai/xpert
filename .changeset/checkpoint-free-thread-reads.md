---
'@xpert-ai/xpert-api': patch
---

Stop restoring checkpoint values for ordinary thread reads so opening conversations and polling run control do not block the API on large saved states. The existing thread route retains metadata and control fields; callers that need execution values must use the explicit thread state route.

Return a localized 404 when the state route cannot find the latest or requested checkpoint, while preserving access checks and allowing ordinary metadata reads for threads without saved state.
