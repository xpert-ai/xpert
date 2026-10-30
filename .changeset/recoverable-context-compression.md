---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Archive completed tool history before automatic context compression and expose scoped, paginated recovery of original content and arguments. Preserve user constraints, incomplete and recent tool cycles, honor recovery tool policy, summarize large histories in bounded batches, and copy referenced evidence transactionally when forking conversations. Keep the original history if archival, access, recovery availability, or summary validation fails.
