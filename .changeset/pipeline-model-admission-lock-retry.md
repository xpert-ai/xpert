---
'@xpert-ai/xpert-api': patch
'@xpert-ai/server-ai': patch
---

Retry model budget admission up to three total attempts after PostgreSQL lock timeouts roll back the transaction. Recheck persisted work and budget on each attempt, retain the first lock failure when retries are exhausted, and leave business denials and uncertain connection outcomes unretried.
