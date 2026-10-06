# Built-in Project Tasks Plugin

`project-tasks` is registered with `@AgentMiddlewareStrategy` in the platform's built-in middleware catalog and provided by `XpertProjectModule`. It requires no separate npm plugin installation and no longer constructs a `ProjectToolset`.

The project's general agent loads this middleware from the registry by default. Other Assistants can add **Plugin → Project Tasks** in Studio and connect it to an Agent. Tool toggles and runtime user preferences use the standard Middleware Tools flow. The middleware does not set `meta.builtin: true`: that flag hides a middleware and prevents users from adding it, unlike the registration source `source.kind: builtin`.

## Tools

| Tool                         | Capability                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `project_list_tasks`         | List current project tasks and their projected Invocation status.                                          |
| `project_create_tasks`       | Create todo tasks and return their IDs, revisions, and completion requirements without starting execution. |
| `project_update_tasks`       | Update business tasks and steps without writing execution state owned by the Runtime.                      |
| `project_list_task_runtimes` | List authorized Runtime bindings in the caller's workspace.                                                |
| `project_dispatch_task`      | Explicitly and idempotently delegate an existing task using a requestId.                                   |
| `project_get_task`           | Read task details and authorized execution results.                                                        |

Middleware options are an empty object. Project, conversation, user, organization, execution ID, and Agent identity come from host context; tool arguments and Plugin configuration cannot supply them. Studio can discover tool schemas without an active project, but execution is rejected before any service access. Every invocation rechecks project permissions.

The project's general agent explicitly uses `callerType: project_agent` and `agentKey: general_agent`. Other Assistants use their own Xpert/Agent identity. Legacy Assistant hosts that omit callerType retain existing Assistant semantics; identity is never inferred from an Agent's name. The execution ID comes from the current turn's Runnable config, falling back to host middleware context. The dispatch service validates the persisted relationships between execution, conversation, project, and workspace.

Creation and update tools use strict input schemas with explicit bounds. All tools provide localized `metadata.toolName` values and detailed validation errors. The host propagates the middleware icon, and tool events use the stable provider name `project-tasks`.

## Migration and scope

`ProjectToolset`, `CreateProjectToolsetCommand`, its handler, and the Toolset barrel exports have been removed. The six model-facing tool names above remain stable. External code importing the old class or command should configure the `project-tasks` middleware instead. Direct Project-to-Toolset binding remains unsupported.

Delegation preserves requestId, Invocation identity, authorization policies, serialized project dispatch, and explicit `modelSource` requirements. Apply `20261006-project-task-runtime.sql` before deployment. Pro provides the Computer executor; OS includes the general Runtime delegation protocol and model authorization policies.

This batch supports explicit delegation and result inspection. Retrying the same requestId can recover a reservation that has not started; running executions and executions with an uncertain outcome are never relaunched. Completion requirements are separate from reported step progress. Runtime success does not automatically complete a business task, and finishing every step does not automatically accept a task with an existing Runtime attempt.

Automatic background dispatch recovery, reliable result messages, asynchronous conversation continuation, result acceptance, and message cards are introduced in later batches.
