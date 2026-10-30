---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/headless-ui': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Reset generation parameters when changing model identities while retaining client retries and same-model overrides. Preserve numeric input drafts and commit edits before saving. Persist explicitly cleared optional parameters without restoring defaults or sending them in provider requests, including ModelExecution snapshots and native protocols.
