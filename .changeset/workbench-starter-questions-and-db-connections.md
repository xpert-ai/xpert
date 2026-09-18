---
'@xpert-ai/contracts': patch
'@xpert-ai/xpert-ui': patch
---

Add an opt-in frequent-question start screen using the existing question API, and expose the generic `platform.data-source.create` client command so plugins can open the host's permission-checked data source creation dialog without receiving credentials.

The compact question list requires the ChatKit release supporting startScreen.promptsLayout.
