---
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Expose current-request platform permissions without role-administration access,
preserving live grants, JWT permission ceilings and tenant/organization isolation.

Support explicit authentication strategies on controllers and routes. The current
permissions endpoint requires JWT, while unannotated routes retain the open-source
server's JWT/Basic defaults. Reject anonymous, Basic and API-key credentials on
the permissions endpoint without marking it public or authenticating twice.
