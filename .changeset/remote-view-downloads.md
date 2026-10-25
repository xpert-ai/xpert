---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Fix downloads in the task results and coding execution views when the host returns
authorized file bytes as a data URL. Download those bytes as an iframe-owned
attachment, retain HTTP grant support and reject unsafe or malformed URLs.
