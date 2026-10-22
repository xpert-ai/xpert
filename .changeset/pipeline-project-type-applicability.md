---
'@xpert-ai/contracts': patch
'@xpert-ai/plugin-sdk': patch
'@xpert-ai/server-ai': patch
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Require pipeline templates to declare their supported application and project types. Filter the configuration catalog and enforce the persisted project type when saving configurations and starting runs, so templates cannot execute in unrelated projects.

Upgrade pipeline contributions together with the host and create compatible configurations for typed projects; legacy definitions without an explicit project type are not implicitly accepted. Preserve runtime scope in the remote-view preview host for realistic plugin verification.
