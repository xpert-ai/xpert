---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Preserve existing toolset bindings when refreshing Assistant templates in workspaces with multiple instances of the same provider. Validate the bound toolset against the current organization and workspace, while retaining ambiguity checks for new installations and rejecting unavailable bindings. Isolate toolset dependency inspection in a dedicated method.
