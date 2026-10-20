---
'@xpert-ai/server-ai': minor
'@xpert-ai/contracts': minor
'@xpert-ai/xpert-api': minor
'@xpert-ai/xpert-ui': minor
---

Allow side chats to fork the latest sealed assistant reply while the source keeps running. Validate and copy pinned root, subgraph and ancestor checkpoints without pending work or live Goals. Reuse the created thread when a request is retried after the source advances.

Expose the same behavior from Conversation Map and return a localized explanation when no sealed reply is available. Keep bodyless legacy copies idle-only and preserve historical input editing. Shared checkpoint references remain a separate, unimplemented architecture proposal.
