---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/server-core': patch
---

Unify managed Assistant application state under WorkspaceFilesRuntimeCapability.appData(). Resolve namespaces from loaded plugin metadata; revalidate the current actor and published Assistant on every operation. Shared workspaces remain supported unless the application requires user isolation. Reuse atomic Volume writes and shared-filesystem locks, and protect .apps from generic Files, downloads, parser inputs and sandbox file uploads. Preserve Studio draft access through explicit authoring authority.

NsJail Runner protocol 3 masks .apps with an empty read-only mount and blocks file RPC access. Upgrade the Runner before the API; older Runners fail closed. Local Shell is trusted development execution and does not provide OS isolation. No old application data is migrated.

Pin application handles to their original workspace, and reject private file projections after a switch to shared storage. Renew lock leases only after successful filesystem heartbeats, verify lock ownership before mutations, and preserve replacement owners on release. Reject root aliases into managed data and protect managed descendants during recursive deletion.
