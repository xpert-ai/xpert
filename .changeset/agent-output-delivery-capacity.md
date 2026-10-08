---
'@xpert-ai/contracts': minor
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
---

Allow up to 128 exact relative file paths in explicit Agent output deliveries, for
both individual files and archives. Keep relative-path validation and wildcard
rejection unchanged.

Extract the existing 10 MiB Assistant workspace upload limit into a shared server
constant so runtime adapters can reuse it without depending on the HTTP controller.
This does not change upload size or workspace access checks.
