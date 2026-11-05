---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Report local Sandbox Job runtimes as unavailable on non-Linux hosts, where the current supervisor cannot prove descendant exit. Reject controlled runtime creation before starting a process and direct users to a healthy Linux Runtime Provider. This prevents new unverifiable executions; it does not reclaim existing jobs with unknown exit state.
