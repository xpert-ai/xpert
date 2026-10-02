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
