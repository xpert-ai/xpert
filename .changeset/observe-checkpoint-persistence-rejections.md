---
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
'@xpert-ai/desktop': patch
---

Observe background LangGraph checkpoint rejections immediately while preserving the original failure for graph execution to report. Carry the pinned patch and matching locks through API, Web and Desktop dependency preparation.

Backport only the rejection-observation fix from [langgraphjs#2969](https://github.com/langchain-ai/langgraphjs/pull/2969) to LangGraph 0.4.7. Track the deferred official-version migration and patch removal criteria in `patches/README.md`.
