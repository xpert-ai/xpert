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

## Host execution runner

`AgentExecutionRunnerFactoryCapability` is an optional host extension. The invocation factory captures an immutable identity scope for each operation, creates a scoped runner, and exposes only `AgentExecutionRunnerCapability` to the runtime strategy. It does not expose the global capability registry or the runner factory. Construction performs no launch or other I/O; normal invocation and binding authorization still precedes strategy dispatch.

The runner starts an already persisted invocation, observes its process, sends requests over an approved relative-path transport, collects explicitly requested artifacts and requests termination. Each host implementation must validate the invocation owner, scope, binding and recorded receipt before acting. A receipt contains IDs and an authorized working directory, never model credentials or arbitrary caller-selected commands. Checkpoint it before sending the initial task; ambiguous launch or process state must not trigger an automatic replay.

The SDK contract supports host-managed Computer and Sandbox instances without naming a specific CLI or model provider. Tool/version/environment compatibility is explicitly declared in `executionTools` and remains separate from authorization. Concrete environment implementations and their supported tools are registered by the host; declaring a type does not install or enable an executor. Direct remote runtimes continue to use session/run handles without a runner.

Execution grant lifetime follows the CLI session or managed invocation, independently of browser/Desktop login and viewing/control connections. Terminal completion, cancellation, expiry or invalid permissions still require host reconciliation. A stop request is not proof of termination: only `exited` confirms the process stopped, and `unknown` must remain visible.
