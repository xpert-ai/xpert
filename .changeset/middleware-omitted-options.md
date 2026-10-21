---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Use an empty configuration only when middleware options are omitted across tool preview, testing and execution, including previously published Assistant nodes. Preserve explicit invalid values for provider validation and keep runtime node context consistent without rewriting saved graphs.
