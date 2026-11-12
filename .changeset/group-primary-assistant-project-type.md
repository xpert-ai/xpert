---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Limit group Composer Project type choices to the Assistant's configured type. Derive group Project creation and binding validation from the primary Assistant, reject mismatched types, and retain general Project compatibility for Assistants and legacy Projects without an explicit type.
