---
'@xpert-ai/contracts': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add personal API keys in account settings, with one-time secret display, hashed storage, expiration and revocation. Authenticate requests as the key's human owner with their current permissions while preserving resource-bound API key and client-secret behavior.
