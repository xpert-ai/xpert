---
'@xpert-ai/server-core': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Preserve the loaded artifact source on the first plugin configuration save. Save configuration in a short database transaction without overwriting installation identity, staged versions, restart flags or pending publication metadata, including concurrent first saves and installations.
