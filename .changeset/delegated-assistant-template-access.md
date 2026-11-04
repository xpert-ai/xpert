---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Check runtime template dependencies through the published Assistant access policy so delegated assistants can run without requiring file-management permissions. Preserve live access checks and explicit version requirements from older template metadata, while keeping authoring checks under file-access authorization.
