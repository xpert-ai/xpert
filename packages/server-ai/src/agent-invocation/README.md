# Agent invocation runtime

The functional design and rollout sequence are in
[Unified Agent Invocation](../../../../docs/plans/2026-09-22-unified-agent-invocation.md).

- `AgentInvocationRuntime`: authorization, idempotency, pinned strategies and compare-and-swap state transitions.
- `TypeOrmAgentInvocationStore`: state and append-only observation history in one transaction.
- `AgentInvocationFactoryService`: scoped plugin capability and workspace binding resolution.
- `AgentInvocationGraphService` / `NativeAgentCompiler`: native graph compatibility, ordinary tool wrapping and workflow calls.
- `assistant-task-adapter`: compatible background task transport, without facade recursion.
- `invocation-task-wait`: bounded observation for Agent-driven status polling; only human interactions suspend.
- `invocation-wait` and the durable monitor: historical checkpoint compatibility.

Native tool calls record `invocationKind` and `sourceToolCallId` in execution
metadata. The latter identifies the Tool component ID within the parent
execution (`parentId`), and is exposed unchanged in conversation run summaries.
Workflow-driven runs omit the tool association. Consumers can merge correlated
dispatch rows into execution views without depending on private middleware names;
unassociated or failed dispatches must remain visible.

Apply `migrations/20260922-agent-invocation.sql` before deploying this host version.
No migration or service restart is performed by unit tests. External strategies
and their operator instructions live in `xpert-plugins/xpertai/integrations/agent-runtimes`.

## Generic long-task waiting

See [Bounded task observation](../runtime-task/README.md) for the unified `task_status` tool, any/all queries, duration limits, human interactions and adding non-CLI domain jobs. `AgentInvocationApi.waitForTasks` backs the tool and complements the single-task `awaitResult` API. An elapsed observation window returns `pending` normally; it does not suspend the parent or imply task completion.

## Typed results and delivery

`AgentInvocationResult` retains text for existing consumers and adds optional typed items (`analysis`, `changes`, `tests`, `file`), committed artifact references and a separate export status. Adapters normalize their own final output; the host does not parse provider protocols. The SDK schemas define the portable result envelope and relative file selections.

File delivery defaults to `none`. Findings, code edits and test runs do not automatically create artifacts. A caller may request `files` or `archive`, optionally restricting the exact paths. The authorized execution runner validates that policy before reading the selected files. Unsupported export or collection failure preserves the execution result and reports its separate export status.

`InvocationResultsProvider` supplies an on-demand task-results View. Result tools emit ChatKit resource cards using the SDK event bridge; the host binds each event to its actual assistant reply before persistence and streaming. The View revalidates the task owner, Assistant, conversation/project scope and binding. Downloads must reference an artifact recorded on that task and resolve its pinned version through the platform file-access flow. Resource cards never grant access by themselves and never enter the model's text context.

Deploy the matching ChatKit types/UI, contracts/SDK and host before updating a consuming runtime plugin. See [Resource card integration](../../../plugin-sdk/RESOURCE-CARDS.md).
