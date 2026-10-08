---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/cli-model-profiles': patch
---

Add version-qualified background CLI profiles for Claude Code 2.1.63, CodeBuddy
2.161.1 and Kimi Code 2.1.1. Support an optional literal argv prompt argument in
the SDK JSONL transport contract. Configure isolated settings and explicit
permission modes; Kimi advertises only allow because its prompt mode forces
automatic approval. Keep revisions unchanged for unrelated tools.

Execution still requires a matching host transport and Agent Runtime adapter.
