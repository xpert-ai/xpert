---
'@xpert-ai/server-core': patch
'@xpert-ai/xpert-api': patch
---

Attribute providers and controllers returned by a plugin's dynamic `register()` module to their plugin scope and version before discovery. This lets Data Xpert verify managed middleware readiness instead of seeing those providers as built-in. Skip primitive provider values and string aliases when attaching reflection metadata.
