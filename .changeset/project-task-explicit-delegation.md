---
'@xpert-ai/contracts': minor
'@xpert-ai/plugin-sdk': minor
'@xpert-ai/server-ai': minor
---

Separate Project Task creation from execution and add authorized Runtime discovery, explicit idempotent task dispatch, specification snapshots and task details. Persist attempts and pinned dispatch intents before launching through the existing Invocation runtime; serialize Project execution admission and preserve native handoff behavior.

Support the built-in Project general agent as an explicit caller/reply identity. Computer invocations from this caller require a binding with an explicit `modelSource` referring to an accessible Assistant in the Project workspace; that Assistant supplies model policy, not caller identity or task ownership.

Apply `20261006-project-task-runtime.sql` before deploying the host. This stage supports durable dispatch identity and explicit retry/inspection, but does not enable autonomous recovery scanning, reliable result messages, automatic continuation or acceptance workflows.

Replace the legacy ProjectToolset and its creation command with the built-in `project-tasks` Middleware Plugin. Project general agents load it from the registry; Assistants can configure it through ordinary Plugin nodes and tool preferences. Preserve the six tool names while validating host-owned project/caller scope, localizing tool display metadata, and retaining Invocation status ownership.
