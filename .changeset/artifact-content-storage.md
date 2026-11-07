---
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-ai': minor
'@xpert-ai/server-core': patch
---

Store existing Artifact content through the system FileStorage provider while preserving storage-agnostic logical references, protected local content, Artifact authorization and fixed versions. Read tenant storage settings from the SDK request context. Changing system storage configuration requires operator-managed data migration without changing file references.

The internal Artifact byte storage implementation is beta and may change incompatibly. No new Workspace file API or public reference fields are introduced.
