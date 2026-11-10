---
'@xpert-ai/server-ai': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Renew invocation startup leases for up to ten minutes while the launch owner remains active. Pin each startup owner, preserve revision checks, and stop renewal after cancellation, ownership changes, expiry or persistence failure. Clear the startup fence when launch completes. Renew short leases before expiry while preserving the default heartbeat frequency.
