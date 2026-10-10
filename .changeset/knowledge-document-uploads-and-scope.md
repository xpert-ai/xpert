---
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Group Knowledge capabilities under `rag/capability` and expose resumable upload sessions through `Documents.uploads`. Support idempotent document imports without automatic processing, plus filename and folder-path search with MIME type filters so unprocessed images remain discoverable.

Allow organizations to read public tenant libraries while requiring super administrators to explicitly select tenant scope before managing them. Keep document processing behind write-access checks without switching the caller's request scope. Release the SDK and host implementation together for the new upload API.
