---
'@xpert-ai/server-ai': patch
'@xpert-ai/plugin-sdk': patch
---

Preserve the ENOENT error code when scoped workspace file operations encounter missing files or an uninitialized root. Document the in-process runtime file contract so plugins can distinguish missing files from other failures without interpreting localized messages. Keep path boundaries and HTTP error responses unchanged.
