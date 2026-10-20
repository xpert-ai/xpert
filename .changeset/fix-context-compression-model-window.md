---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Use the resolved model context window consistently for primary calls and context compression. Preserve explicit provider limits and remove model-name guesses that can incorrectly reject summary input for custom endpoints.
