---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/contracts': patch
'@xpert-ai/xpert-ui': patch
---

Include authorized conversation metadata in thread reads and message counts in activity snapshots so ChatKit can reuse its history baseline. Reuse ChatKit's loaded context in the Cloud host instead of fetching messages again. Read task summaries without synchronous legacy backfill writes and cache unchanged message projections by caller and message revision while rechecking file relations.
