---
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/plugin-draft': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-core': patch
---

Support a separate browser-reachable signing endpoint for private S3-compatible buckets, preserve object content types through unified uploads and quota wrappers, validate signed URL expiry, encode public object keys, and invalidate tenant settings caches after changing the default provider. Document the POSIX Workspace/Artifact boundary and add real MinIO regression coverage.
