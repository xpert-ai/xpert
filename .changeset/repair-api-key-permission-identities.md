---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Load current, credential-free users and role grants when resolving resource API key identities, including API-key-backed client secrets. Preserve tenant, organization and resource boundaries, personal identities and management restrictions, with HTTP and database regression coverage for #1328.
