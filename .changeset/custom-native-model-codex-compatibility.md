---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/cli-model-profiles': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Resolve custom native model capabilities and credentials from the authorized provider model record. Pass the selected model's reasoning effort to Codex, accept namespaces containing only client-executed Responses tools, preserve budget callbacks across separate LangChain module copies, and report sanitized native transport diagnostics.
