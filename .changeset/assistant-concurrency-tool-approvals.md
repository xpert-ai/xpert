---
'@xpert-ai/contracts': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Disable Assistant maxConcurrency customization and omit it from LangGraph execution. Retain the deprecated type field for plugin and external-template compatibility, accepting it without errors and silently ignoring it. Remove it from built-in templates and strip legacy values when saving drafts or publishing Assistants. Resolve approval tool calls by checkpoint identity across trailing tool results and repeated tool names, and distinguish unfinished work from approval stops.
