---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
---

Add optional ResourceCardProvider registration and batched, read-only card resolution to the plugin SDK. Dispatch live conversation card updates through a single host handler with scoped provider lookup, resource identity validation and isolated deadlines. Migrate project task cards to this provider path while keeping unregistered types as saved snapshots. Keep initial project card construction and refreshed presentation together in ProjectTaskCardProvider.
