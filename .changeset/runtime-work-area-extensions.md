---
'@xpert-ai/server-ai': minor
---

Add provider-scoped extensions for runtime work-area resolution. Host modules can
map authorized project paths into an existing runtime without coupling shared
Agent and conversation code to a specific runtime implementation. Keep default
path mappings when no extension applies, propagate authorization errors and preserve
passive lookups without filesystem creation.

Centralize sandbox target selection for Agent invocation and conversation access:
an explicitly selected environment takes precedence over project and user bindings.
Keep this policy in the Sandbox layer, independent of the work area's storage and
path mappings. Project files remain in their project volume when execution uses a
separate environment, and active acquisition and passive lookup use the same target.
