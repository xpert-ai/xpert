---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Fix Conversation Map validation errors when newly created conversations do not yet have a title, with a consistent fallback for missing or blank titles.

In tree mode, combine uninterrupted message paths into summary nodes and split them at actual message forks. Show only the latest human question and a short AI reply, and open the actual conversation history for message details and individual message actions. Read lightweight ancestry metadata and batch only the message bodies needed for summaries instead of loading complete histories for every branch. Preserve relation graph, list, and search behavior.
