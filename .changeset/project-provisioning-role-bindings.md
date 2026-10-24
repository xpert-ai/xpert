---
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Expose `ProjectAssistantBinding` and return `assistantBindings` from managed Project provisioning so native pipeline applications can bind role executors by plugin, template and agent identity. These are resolved role requirements; `xpertIds` remains the Project membership list.
