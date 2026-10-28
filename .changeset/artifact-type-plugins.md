---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-ui': minor
'@xpert-ai/server-core': patch
---

Add ArtifactTypeProvider contributions with loader-owned namespace, explicit installation binding, content validation, sharing restrictions, and snapshot or authenticated presentation modes. Persist typeBinding on Artifact and deny unbound or unavailable types without fallback. Reuse the existing Artifact runtime API and Presentation Provider protocol.

Implement conversation snapshots as a built-in Artifact plugin, retaining the ChatKit read-only message UI and source authorization. Add an isolated anonymous snapshot viewer without a query channel; keep authenticated queries scoped to the current viewer and matching plugin installation. Remove the previous host-only source-policy contract. Existing experimental untyped records are not automatically converted.
