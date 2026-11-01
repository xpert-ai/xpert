---
'@xpert-ai/xpert-ui': patch
---

Share one notification SSE connection per authenticated scope across visible pages, relay invalidations between pages, and release connections and retries when a page becomes inactive. Refresh notifications after visibility or page restoration and retain polling when cross-page coordination is unavailable.

Make development route preloading opt-in to reduce contention with API requests and component compilation while preserving production preloading and explicit opt-outs.
