---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Recover orphaned executions that remain stopping after their owner disappears without a graph-end receipt. Finalize the execution, message, task and conversation atomically only after ownership fencing and complete tool/child settlement evidence, preserving saved work and allowing the next user message without replaying actions.
