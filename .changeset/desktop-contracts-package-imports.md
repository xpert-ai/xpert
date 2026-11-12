---
'@xpert-ai/contracts': patch
'@xpert-ai/desktop': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Export Desktop's voice control and unread Assistant summary types from the public contracts entry point. Use package imports throughout Desktop instead of reaching into contracts source files, including notification parsers and Assistant ordering.
