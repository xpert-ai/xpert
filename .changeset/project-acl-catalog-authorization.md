---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Let project permission guards enforce the current project ACL without a second tenant-wide management requirement. Preserve collection-level grants and authenticated project scope. Add fresh, bounded project catalog authorization that batches ordinary ownership and membership reads while retaining live Assistant principal binding checks and propagating incomplete authorization reads.
