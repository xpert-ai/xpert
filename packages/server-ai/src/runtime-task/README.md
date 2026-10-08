# Bounded task observation

Domain execution, Agent reasoning and the browser stream have separate lifecycles. A task handle remains valid after one observation window ends. Ordinary running work returns `pending` to the Agent; it does not create a graph interrupt or show “task suspended” in the UI.

## Model-facing tools

- A configured launcher such as `code_task` starts an idempotent task. `auto` and historical `wait` briefly observe it (default 2 seconds); `background` returns immediately. A nonterminal result includes the existing task handle so the Agent can continue observing it.
- `task_status({ taskIds, mode, timeoutMs })` combines querying and waiting. `timeoutMs: 0` reads immediately; a positive duration waits for completion, up to the host limit. Default duration is 30 seconds. `mode` is `any` or `all`; up to 32 distinct handles are accepted. There is no separate model-facing `task_wait` tool.
- `task_cancel({ taskId })` requests domain cancellation. `cancelling` does not claim that termination is confirmed.

Example Agent loop:

```text
code_task(prompt) -> taskId, running
Agent: explain progress briefly or do independent work
 task_status(taskIds=[taskId], timeoutMs=30000) -> pending
Agent: choose another window
 task_status(taskIds=[taskId], timeoutMs=60000) -> completed, succeeded, result
Agent: summarize actual results and artifacts
```

The backend observes state during each window; it does not call an LLM on every timer tick. The next Agent decision happens only when the tool returns. Longer windows reduce repeated model calls. Parent reasoning/tool turns still consume model tokens and are subject to the normal execution and recursion limits. Do not use rapid zero-duration polling for ongoing work.

A `completed` dependency includes confirmed failure/cancellation; check each task's status before reporting success. `any` leaves remaining tasks running. `pending` is a normal tool result, not failure and not permission to start a duplicate. Unknown outcomes return `unavailable` with their actual status; never relaunch them automatically.

## Generic boundaries

SDK `TaskWaitRequest`, `TaskWaitResult`, `TaskDependencyState` and `taskWaitReason` define provider-neutral dependency semantics. `observeTasks` takes a domain adapter with `read` and explicit state mapping. It knows nothing about LLMs, CLI commands, artifacts, billing or LangGraph.

Agent Invocation is the first integration. It revalidates the caller's access on every inspection and exposes the same observation contract across runtime strategies. New render/import/workflow jobs can implement `IAgentRuntimeStrategy`: `start` delegates to their scheduler, `inspect` reads their persisted receipt, and `cancel` requests domain cancellation. Managed Queue remains the scheduler for plugin-owned jobs. No provider-specific branch belongs in the waiter.

Only a real human interaction may use a graph interrupt. Automatic notifications or elapsed wait time cannot approve it; a response must match the current interaction ID. An immediate `task_status` query merely reports attention without suspending. Ending observation does not cancel domain work.

## Bounds

| Operator setting                | Default   | Purpose                           |
| ------------------------------- | --------- | --------------------------------- |
| `XPERT_TASK_INLINE_WAIT_MS`     | 2,000 ms  | Initial launcher observation      |
| `XPERT_TASK_MAX_INLINE_WAIT_MS` | 60,000 ms | Cap on each Agent-selected window |
| `XPERT_TASK_POLL_INTERVAL_MS`   | 500 ms    | Backend state inspection interval |

A requested window is clamped to the operator cap. Provider `inspect` implementations must bound their own I/O and must never relaunch work. Cancelling the parent aborts its observation timer; stopping the child is a separate explicit operation. Refreshing the browser relies on the existing run-stream reconnect behavior. A durable child receipt does not by itself guarantee automatic parent-turn recovery after an API process restart.

## Historical checkpoint compatibility

New normal waits do not write `agent_invocation_wait` rows. The legacy monitor, claims and checkpoint fences remain to drain existing suspended conversations safely. Their historical `XPERT_TASK_MAX_WAIT_MS` (24 hours) and `XPERT_TASK_UNKNOWN_GRACE_MS` (5 minutes) still apply to those records; they do not set a new status call's duration. The task-wait migration preserves historical records and remains required for deployments that include the legacy monitor's extended schema.

Apply `../agent-invocation/migrations/20261001-invocation-wait.sql` followed by `20261002-task-wait-groups.sql` before deploying the host. The latter also upgrades single-task waits; it is safe to rerun. Malformed stored groups fail closed before provider access. If a human checkpoint replaces an automatic wait, its continuation is marked `blocked` (`awaiting_user`); only the user's explicit response may continue it, including after the historical deadline expires. This block does not cancel the domain task.

The SDK's `waitForTasks` is an internal host capability used by `task_status`, not another tool offered to the model. The old `awaitAgentInvocation` helper exists only for historical compatibility tests; the production factory uses bounded observation.

## Validation

Tests cover pending results without graph suspension, repeated observations of the same handles, any/all semantics, early completion, operator caps, immediate queries, invalid durations, authorization checks and human approval isolation. The plugin's dist-first harness verifies the generated tool schemas and duration forwarding. Runtime acceptance must also check that the published Assistant permits repeated `task_status` calls; an old prompt that forbids polling overrides the new tool description.
