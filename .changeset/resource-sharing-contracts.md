---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/xpert-api': patch
'@xpert-ai/xpert-ui': patch
---

Define fixed-version group resource grants, references, bounded analysis policies and Workbench navigation contracts. Add opt-in artifact type validation, optional Artifact Type analytics bindings and query-provider sharing checks and a typed grant-management capability for external authoring plugins.

Keep source and runtime Project identities separate, and defer the legacy short-ID generator until first use so importing shared contracts remains compatible with embedded View CSP. Runtime authorization, query execution and client workflows follow in separate changes.
