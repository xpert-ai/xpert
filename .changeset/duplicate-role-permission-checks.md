---
'@xpert-ai/server-core': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-api': patch
---

Check required permissions by membership instead of counting matching role records. Duplicate enabled grants no longer deny Project catalogs or substitute for a different missing permission. Apply the same behavior to the server and Plugin SDK request contexts.
