---
'@xpert-ai/contracts': patch
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Extend the existing api_key table and authentication flow with USER-bound personal keys in account settings, with one-time secret display, hashed storage, expiration and revocation. Authenticate requests as the key's human owner with their current permissions while preserving resource-bound API key and client-secret behavior.

Instances that tested the separate-table draft can preserve those credentials with the one-time `packages/server/src/api-key/personal-api-key/migrate-personal-api-keys.sql` script after schema synchronization.
