---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Exclude unrelated deleted document records when moving a replacement at the same
path. Preserve explicit document restores and folder restores using the document
identities and epochs captured by the accepted deletion operation.
