---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Give new side chats independent titles with explicit default, generated and manual ownership. Seed a first-question label and optionally summarize the side question and reply using the Assistant's title model. Atomically preserve manual renames and completed titles; never overwrite the shared conversation or inherited graph title. Retain legacy labels whose ownership is unknown.
