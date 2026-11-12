---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Defer Multer storage-provider resolution until an upload request runs, so a system configured with a plugin provider such as MinIO can bootstrap before provider registration. Keep each request's storage engine for multipart cleanup and preserve explicit provider selection.
