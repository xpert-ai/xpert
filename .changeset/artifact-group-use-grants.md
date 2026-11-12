---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Add the OS foundation for explicit cross-project use of a fixed published Artifact version by one group in the same organization. Source managers issue expiring read grants, group owners accept or remove them, and source managers can revoke them. Recheck group membership, the bound runtime Project, source status and resource policy on each authorized read; persist lifecycle and access audits.

Artifact types must opt in to authenticated group use and can enforce resource-specific delegation policy. Grants do not confer source Project membership, data query permissions, draft access, editing, export, copying or onward sharing. Viewer/reference APIs and application integration follow in separate batches.
