---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Support archiving and restoring side chats through authorized thread metadata updates. Delete a side chat and its message-edit branches atomically while preserving main and sibling conversation history, rejecting active threads and independent child branches. Add localized validation errors and HTTP, lineage, and PostgreSQL regression coverage.
