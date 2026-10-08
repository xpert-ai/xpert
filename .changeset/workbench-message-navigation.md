---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
---

Add optional message anchors and originating-view preservation to Workbench conversation navigation contracts. The navigation resolver accepts an exact thread and message, validates thread ownership and visible user/assistant message membership, and retains the default thread behavior for older requests. Validate optional anchors at the HTTP boundary before resolving access.
