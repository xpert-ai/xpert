# Built-in Project Tasks Plugin

`project-tasks` is registered with `@AgentMiddlewareStrategy` in the platform's built-in middleware catalog and provided by `XpertProjectModule`. It requires no separate npm plugin installation and no longer constructs a `ProjectToolset`.

The project's general agent loads this middleware from the registry by default. Other Assistants can add **Plugin → Project Tasks** in Studio and connect it to an Agent. Tool toggles and runtime user preferences use the standard Middleware Tools flow. The middleware does not set `meta.builtin: true`: that flag hides a middleware and prevents users from adding it, unlike the registration source `source.kind: builtin`.

## Tools

| Tool                         | Capability                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_list_tasks`         | List current project tasks and their projected Invocation status.                                                                               |
| `project_create_tasks`       | Create todo tasks and return their IDs, revisions, and completion requirements without starting execution.                                      |
| `project_update_tasks`       | Update business tasks and steps without writing execution state owned by the Runtime.                                                           |
| `project_decide_task`        | Let the responsible Agent or an authorized human explicitly accept a result or request rework based on the current implementation and evidence. |
| `project_list_task_runtimes` | List authorized Runtime bindings in the caller's workspace.                                                                                     |
| `project_dispatch_task`      | Explicitly delegate an existing task; the host supplies the operation's idempotency key.                                                        |
| `project_get_task`           | Read task details and authorized execution results.                                                                                             |

Middleware options are an empty object. Project, conversation, user, organization, execution ID, and Agent identity come from host context; tool arguments and Plugin configuration cannot supply them. Studio can discover tool schemas without an active project, but execution is rejected before any service access. Every invocation rechecks project permissions.

The project's general agent explicitly uses `callerType: project_agent` and `agentKey: general_agent`. Other Assistants use their own Xpert/Agent identity. Legacy Assistant hosts that omit callerType retain existing Assistant semantics; identity is never inferred from an Agent's name. The execution ID comes from the current turn's Runnable config, falling back to host middleware context. The dispatch service validates the persisted relationships between execution, conversation, project, and workspace.

Creation and update tools use strict input schemas with explicit bounds. All tools provide localized `metadata.toolName` values and detailed validation errors. The host propagates the middleware icon, and tool events use the stable provider name `project-tasks`.

## Migration and scope

`ProjectToolset`, `CreateProjectToolsetCommand`, its handler, and the Toolset barrel exports have been removed. The original six task management and delegation tool names remain stable; result acceptance adds `project_decide_task`. External code importing the old class or command should configure the `project-tasks` middleware instead. Direct Project-to-Toolset binding remains unsupported.

Delegation preserves requestId, Invocation identity, authorization policies, serialized project dispatch, and explicit `modelSource` requirements. To deploy the complete capability, apply the task association migration, the reliable reply migration, and `20261006-project-task-decisions.sql` in that order.

`project_dispatch_task` and `project_decide_task` omit `requestId` from their model-facing schemas. The tool layer derives a versioned UUID from the project, conversation, thread, caller identity, operation and persisted tool-call ID. Replaying that call reconstructs the same key, including after an Agent run changes. Mutable arguments and the current Agent execution ID are deliberately excluded: changed arguments for the same call must reach the existing conflict checks. Missing tool-call identity fails before issuing a command; there is no random fallback. Models cannot supply or override the key.

The existing dispatch intent or task decision persists that key. Background recovery reads the original intent, preserving earlier records and their existing keys. Internal commands and management APIs retain the full `requestId` contract; no database migration is required. A new tool call gets a new key, so semantic repeats generated by the model are not deduplicated by text similarity. When an earlier call's outcome is uncertain, the Agent must inspect `project_get_task` before intentionally requesting another attempt or decision.

Explicit delegation supports retries with the same host-managed requestId and result inspection. Retrying can recover a reservation that has not started; running executions and executions with an uncertain outcome are never relaunched. Completion requirements are separate from reported step progress. Runtime success does not automatically complete a business task, and finishing every step does not automatically accept a task with an existing Runtime attempt.

## Reliable replies and task progress

After applying the task association migration, apply `handoff/runtime-messaging/migrations/20261006-runtime-reliable-replies.sql` before enabling the background workers. The host recovers pending dispatch intents, observes existing invocations independently of the parent turn, and delivers result references through durable outbox and inbox records. A bounded wait and an asynchronous follow-up compete for the same result claim. Busy conversations queue the result; user stops, pauses, and approval or input waits block automatic continuation.

Automatic task updates require the latest implementation attempt, unchanged requirements, and the expected task revision. Actual execution maps to `in_progress`, success to `review`, and failure to `blocked`. Cancelling a run does not cancel the business task. User decisions and provider-owned tasks are preserved.

See [Reliable Runtime replies](../../../handoff/runtime-messaging/README.md) for authorization, recovery, delivery inspection, and redrive behavior.

## OS and Pro boundary

OS includes the review protocol, version-bound evidence checks, acceptance decisions, and Tasks & Timeline presentation. The current independent review dispatch gate accepts only Computer OpenCode bindings because that runner provides evidence-only confinement. The Computer executor, isolated review directory, and CLI configuration are supplied by Pro; they are not implemented by this OS package. Other Runtime bindings can implement tasks, but cannot receive independent review requests until confinement is supported.

## Result acceptance

The Runtime reports execution facts only. Successful implementation moves the task to `review`; the Agent responsible for the delegation or an authorized human then calls `project_decide_task`. Ordinary update tools cannot mark a task with Runtime attempts as complete. Updates and dispatch share the project transaction lock to prevent a race in which an attempt appears between a completion check and the save. A decision records the task revision, latest implementation attempt, specification digest, result revision or Artifact version, checks performed, and rationale. The decision and status change are committed in one transaction; retrying the same requestId returns the original decision.

Independent review reuses `project_dispatch_task` with an explicit `purpose.type=review`, implementation reference, and evidence references. Currently, it accepts only Computer OpenCode bindings. The reviewer runs in a separate directory with tools, MCP, plugins, and additional Agents disabled. It inspects fixed result evidence without modifying the implementation. The structured verdict is `pass`, `changes_required`, or `indeterminate`. Free text, outdated specifications, superseded implementations or results, and changed Artifact versions cannot support acceptance. A `workspace_snapshot` reference is rejected because no verifiable version resolver is available yet; a file path is not treated as authorization to access evidence.

This version provides static evidence review. Implementation results should include complete source code, test code, and execution reports. A `pass` verdict means that the fixed evidence supports the requirements; it does not mean the reviewer reran the tests or verified the files' authenticity. Reports must retain these limitations. The responsible Agent can use its authorized Computer tools to inspect actual outputs and rerun tests. If independent review has been delegated, acceptance must reference the latest valid passing review. It cannot omit reviewExecutionId, cite an earlier passing report, or bypass the requirement with free text.

Background startup uses a persisted inspection fence lasting at most 120 seconds, preventing concurrent inspections from misclassifying intermediate process receipts as unknown. Cancellation remains available, and normal inspection resumes after the deadline. A missing CLI or version mismatch is recorded as failed only when execution has verifiably not started. Failures after a launch receipt has been saved remain unknown and are not automatically replayed.

The Tasks and Timeline view shows the full Invocation status, actual start time, progress provenance, implementation and review attempts, reliable delivery and consumption status, results, and business decisions. Details refresh every five seconds while visible. Humans can open the responsible Agent's conversation, cancel a single run, retry failed result delivery, and record acceptance or rework decisions. Cancelling a run does not cancel the entire business task.

## Multiple Computer runtimes and explicit delivery

Project delegation supports both Computer OpenCode and Computer Codex through authorized Runtime bindings. Codex requires the matching `agent-runtimes` plugin, Computer image and host policy version; a CLI binary alone does not register a Runtime. Independent evidence-only review still uses OpenCode, including when the implementation was produced by Codex.

`project_dispatch_task` accepts optional `delivery: { mode: "files", paths: ["report.txt"] }` or `mode: "archive"`. Omission exports nothing. Relative file selection is pinned before dispatch, participates in idempotency and is checked again by the host collector. Explicit export is unavailable for evidence-only review. Execution success and export success remain separate; business acceptance references committed artifact versions and the immutable invocation result.

No task or reliable-reply service branches on Codex. The Computer adapter owns the CLI protocol; Project owns task decisions. Each invocation uses its own run directory, ephemeral CLI configuration and scoped model grant. This is execution-directory isolation inside the owner's Computer, not a separate security container for each task.

## Conversation presentation

Creation and updates use ordinary tool steps, without a second Computer component or a creation resource card. Only a committed delegation emits an execution card; implementation and independent review retain separate identities. ChatKit displays execution cards during streaming and updates the original card on background results. `ProjectTaskCardProvider.createCard()` owns resource identity, labels, icons and navigation for both the initial dispatch receipt and subsequent `resolveMany()` refreshes; tools only emit the returned card.

Review cards show the verdict only after validating its pinned implementation and evidence. Runtime success without a valid review report is not displayed as approval. The current action is “View task”; a detailed execution viewer remains separate work. Public replies summarize task names and outcomes, keeping technical identifiers in tool records unless diagnostics are requested. Previously saved creation cards remain readable; no history migration is performed.
