---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
---

Add provider-registered business task types with localized labels and controlled Lucide icon tokens. Persist taskType in the existing type column, preserve legacy values, and resolve presentation independently of hierarchy, status and assignee. Project Tasks list, tree, Gantt, board and detail views share one icon renderer. No database migration is required.
