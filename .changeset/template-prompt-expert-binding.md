---
'@xpert-ai/server-ai': patch
---

Associate newly initialized template prompt workflows with the expert created from that template in both import and plugin installation flows. Preserve existing same-name workflows and their user-defined associations.

Track template provenance to associate repeated installations with each created expert without changing user-owned, archived or global prompts. Initialize template prompts after publishing succeeds so failed installations leave no stale associations.
