---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Allow automatic context compression during long tasks at complete tool cycle boundaries. Preserve the current user request, recent and in-flight tool calls, and matching tool results so compressed histories remain valid. Keep manual compression at whole-turn boundaries.
