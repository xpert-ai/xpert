---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': minor
---

Share Project configuration between Cloud and Assistant Workbench through a portable view with scoped member, skill, connector and automation editors. Keep project access, configuration revisions and task run-as consent in the owning services, and launch OAuth using short-lived single-use browser tickets.

Expose configuration operations through a View-independent ProjectConfigurationApi with trusted actor/project scope and concrete business methods. Keep View action parsing inside the independently registered configuration plugin module.
