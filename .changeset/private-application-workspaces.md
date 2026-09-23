---
'@xpert-ai/contracts': patch
---

Allow private App workspace declarations and omitted sharing in appConfig. The matching host now creates private workspaces for application initialization and missing-workspace repair, including legacy declarations with organization sharing. Existing workspace visibility and membership remain unchanged on initialization retries and repair. Published Assistant runtime access continues to use its existing user-group and workspace-member grants.
