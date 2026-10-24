---
'@xpert-ai/desktop': patch
---

Report recording startup without exposing a capture ID until the server creation callback completes. Preserve scope isolation and retryable cached recordings when startup fails.
