---
'@xpert-ai/contracts': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/server-ai': patch
---

Preserve committed task receipts after partial batch creation and expose task hierarchy, current revisions and authorized review modes to coordinators. Distinguish missing reports from invalid references, stop repeated pending-report reads only when durable delivery targets the current conversation, and retain independent work and result resumption. Keep decision references consistent with transactional task state so completed tasks do not invite another acceptance or rework decision.
