# Model Access in Execution Environments

ModelExecution lets CLIs and managed Agents use models authorized for the current Assistant and attributes actual usage to the calling user. It manages short-lived execution grants, model protocol endpoints, budget admission, and settlement. Task scheduling and desktop control remain outside its scope. The feature is disabled by default.

This document describes the current source design. It does not certify client acceptance or a published release. Computer installation and live execution records are maintained in the corresponding xpert-pro documentation.

## Module Boundaries

| Layer                      | Responsibility                                                                                                                   | Extension entry point                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contracts / SDK            | Execution context, authorized models, usage, and runner protocols                                                                | [ModelExecution types](../packages/contracts/src/ai/model-execution.model.ts), [runner capabilities](../packages/plugin-sdk/src/lib/agent/runtime/execution-runner.ts) |
| Shared server-ai           | Assistant and user authorization, short-lived credentials, budgets, protocol conversion, actual usage, and idempotent settlement | [ModelExecution module](../packages/server-ai/src/model-execution/model-execution.module.ts)                                                                           |
| Model Provider plugins     | Provider connections, credentials, model catalogs, native clients, and pricing capabilities                                      | [NativeModelClient](../packages/plugin-sdk/src/lib/ai-model/native-model.ts)                                                                                           |
| Execution environment host | Validate environment ownership and instance identity; provide launch, observation, cancellation, and file collection             | [ModelExecutionEnvironmentCapability](../packages/plugin-sdk/src/lib/agent/runtime/model-execution.ts)                                                                 |
| Agent runtime plugins      | Tool-specific launch conventions and normalization of status and results                                                         | [Agent Invocation runtime](../packages/server-ai/src/agent-invocation/README.md)                                                                                       |

The shared authorization layer validates environments through capability interfaces and does not depend on a Computer or Docker implementation. The Computer adapter lives in xpert-pro. An SDK declaration of a Computer, Sandbox, or remote type does not mean the corresponding executor is installed. The platform routes requests by protocol and capabilities declared in the model catalog, without inferring compatibility from provider names. Exact CLI version compatibility requirements are maintained separately from provider implementations.

## Authorization Scope of an Execution

A `ModelExecutionGrant` binds one CLI session, one Agent Invocation, or one CLI child execution within a Shell. It pins the tenant, runtime organization, user, Assistant and its published version, conversation, environment instance or remote binding revision, tool, and version. The grant applies to that execution; it is not a general-purpose model key for a user, Assistant, or container. Separate executions in the same container receive separate authorization and metering.

1. The platform resolves scope from the current identity and a conversation owned by that user. The payer and executing user must match. Clients cannot select another payer through a request body or an arbitrary organization header.
2. The platform intersects the published Assistant's model candidates with the user's model permissions, then filters by tool and protocol policies. The default model is chosen from the latest parent execution's selection in the current thread, then the user's Assistant preference, then the Assistant's default candidate. An explicit selection that has been removed does not silently fall back.
3. The grant stores a snapshot of the Copilot ID, Provider configuration ID and its organization, model type, model ID, capabilities, and protocols. `assistant-default` maps to the default model pinned at issuance. Provider credentials are not exposed to the guest environment.
4. The platform issues a random, short-lived execution credential and stores only its hash. It authorizes access to model endpoints, not platform login, further grant issuance, or unlimited renewal.
5. Each request and renewal rechecks the account and organization access, published version, model permissions, execution status, Binding or environment instance, and tool version. Existing snapshots can only become more restrictive. Relaxing a policy does not add models, protocols, or budget to an issued grant. An invalidated default model prevents further use.

Organization access is checked through the shared CQRS entry point [ResolveUserOrganizationAccessCommand](../packages/server/src/user-organization/commands/resolve-user-organization-access.command.ts). ModelExecution delegates that decision and retains its own conversation ownership, published Assistant, and model permission checks. The command's comments describe its contract and intended use.

A grant is bounded by both its renewable lease and a non-extendable absolute deadline. Signing out of a browser or Desktop, disconnecting a viewer, or releasing desktop control does not automatically revoke all model grants. Completion, explicit cancellation, expiry, and invalidated permissions or bindings are handled through the execution lifecycle.

`POST /api/model-execution/revoke-mine` provides a separate, explicit revocation endpoint. It revokes **all active execution grants owned by the current user in the current tenant**, across organizations, Assistants, and conversations. It prevents subsequent authorization checks from succeeding, but does not prove that an already dispatched model request or guest file operation has stopped immediately. Stopping a process still requires cancellation and confirmation of its terminal state. See the [grant service](../packages/server-ai/src/model-execution/execution-grant.service.ts) and [execution source validation](../packages/server-ai/src/model-execution/execution-source.service.ts).

## Shell CLI Authorization and Adapter Boundaries

The generic `sandbox_shell` passes trusted parent execution, conversation, and tool-call context only to execution backends that explicitly declare the `platform_models` capability. It does not parse CLI names from commands, select models, write client configuration, or inject credentials. The Pro execution host implements the Computer Launcher, container isolation, desktop control, and Agent cursor. OSS provides the reusable authorization and metering foundation.

The host maintains `ShellProcessExecution` and `ShellCliExecution` receipts. A `shell_execution` authorization source pins the parent execution, Shell execution, CLI child execution, generation, and profile revision. Model selection comes from the specified parent execution and cannot be borrowed from another execution in the same conversation. Ownership, running state, observation freshness, and environment binding are validated before issuance, at activation, and on subsequent requests.

Launch uses two-phase authorization, `pending → active`: after preparing the short-lived credential and private configuration, the host activates the grant before the one-time launch. A `pending` credential cannot access models. Activation does not reset the preparation lease or revive an expired or revoked grant. Dispatch rechecks the persisted grant. Streaming calls periodically revalidate authorization and cancel the upstream call when authorization becomes invalid. Usage already incurred is still settled from actual receipts.

The [CLI profile SDK](../packages/plugin-sdk/src/lib/agent/runtime/cli-model-profile.ts) declares client protocols, required capabilities, exact versions, offline arguments, and configuration templates. The [built-in profile library](../packages/plugins/cli-model-profiles/README.md) provides configurations for Codex, Claude Code, OpenCode, Aider, Qwen Code, Kimi Code, and CodeBuddy. Templates accept credential placeholders only; the host supplies the actual secrets. Extensions register through `CliModelProfilesCapability`. Adding an arbitrary name to a policy does not authorize an unknown tool. Model Provider details remain in model plugins.

Usage is consistently labeled with the `shell` entry, and the execution ID identifies the CLI child execution. Records support personal usage filters, administrator queries, and CSV export. Multiple CLIs launched from one Shell are recorded separately, with actual usage attributed to the current user.

## Budget Admission and Metering

The [policy schema](../packages/server-ai/src/model-execution/execution-policy.schema.ts) requires an explicit enablement flag and defaults to disabled when unconfigured. Enabling it requires a gateway address, allowed absolute tool paths and exact versions, and the following integer limits:

| Field                                         | Meaning                                                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenBudget`                                 | Cumulative token budget for a single execution grant                                                                                                                              |
| `userTokenBudget`                             | Actual usage over the last 24 hours plus all unreleased reservations for execution calls by the same payer in the same tenant; limited to records with `source='execution_grant'` |
| `maxInputTokens` / `maxOutputTokens`          | Input and output limits; UTF-8 request byte length is also used for a conservative input check                                                                                    |
| `maxConcurrentRequests` / `requestsPerMinute` | Concurrency and rate limits applied at both the grant level and the payer-within-tenant level for execution calls                                                                 |
| `leaseSeconds` / `maxDurationSeconds`         | Renewable lease duration and total execution time limit                                                                                                                           |

These token limits apply to execution endpoints. They are not platform-wide personal usage caps and do not guarantee a strict monetary budget. Charges come from valid usage and pricing results; an unknown charge must remain distinct from a free call.

The [admission service](../packages/server-ai/src/model-execution/execution-admission.service.ts) first serializes access by tenant and payer in the database, then locks the grant and reserves `maxInputTokens` plus the output limit for the current request. Before dispatch, it persists a one-time dispatch marker so the same attempt cannot be dispatched twice. Requests exceeding limits are rejected without silently reducing their size. Calls with unknown outcomes are not automatically resent.

Usage facts are persisted before delivery to the ledger through the existing `CopilotTokenRecordCommand`. The same attempt retains its requestId and delivery receipt, so retries do not create another charge. A parent Assistant and child Invocation may be displayed separately, but a single model call can only be charged once. See the [metering service](../packages/server-ai/src/model-execution/execution-metering.service.ts).

| Call evidence                                                 | State and reservation                                                                    | Settlement behavior                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Not dispatched and no actual usage                            | `failed`; release the reservation                                                        | No usage fact and no charge                                                              |
| Dispatched without valid actual usage, or with estimates only | `settlement_pending`; retain the reservation                                             | Estimates are diagnostic only; await authoritative evidence                              |
| Valid actual usage obtained                                   | Persist an immutable usage fact and release the reservation; delivery may remain pending | Deliver idempotently for the original attempt; a failed model call may still incur usage |
| Manual reconciliation confirms zero usage                     | `failed` / `reconciled_no_usage`; release the reservation                                | Do not fabricate an actual usage ledger entry                                            |

Prompt usage includes cache read and write subsets; Completion usage includes reasoning. These subsets must not be added again. All-zero, negative, non-finite, or inconsistent totals do not constitute a valid usage fact. The [usage schema](../packages/server-ai/src/model-execution/execution-usage-schema.ts) separates actual facts from estimates. `priced`, `free`, and `unpriced` describe the pricing state of a fact; queries may also return an unresolved `pending` state.

Background processing retries delivery and unresolved usage reconciliation every 30 seconds. Once an unresponsive call is more than 15 minutes past `startedAt`, its dispatch marker determines handling: an undispatched call may release its reservation, while a dispatched call retains the reservation for unknown usage. Administrators must reconcile against authoritative evidence. Procedures, metrics, and alerts are documented in the [operations runbook](operations/model-execution-runbook.md).

## Model Protocols

| Policy or capability  | Endpoint and execution path                                                              | Boundary                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Standard Chat         | `openai_chat`, using the shared platform Chat executor                                   | Subject to authorized models and tool capabilities                                                        |
| `nativeProtocols`     | `openai_responses` and `anthropic_messages`, using the Provider's `getNativeModelClient` | Disabled by default; the model catalog must explicitly declare `native_protocols`                         |
| `chatBridgeProtocols` | The same Responses and Messages endpoints, converted to platform Chat requests           | Disabled by default; snapshots record `openai_responses_chat` and `anthropic_messages_chat`, respectively |

The transport is pinned when the grant is issued. When both paths are available, the native path takes precedence. A native failure does not trigger a retry through Chat or expand authorization. See [tool/model filtering and version compatibility](../packages/server-ai/src/model-execution/execution-tool-model.ts) and [native Provider resolution](../packages/server-ai/src/model-execution/execution-native-provider.service.ts).

Native endpoints preserve supported native messages, tool results, and reasoning content. The SDK's Messages transport can forward `anthropic-*` feature headers. Responses enforces `store: false` and rejects background requests and server-side conversation references. Inputs currently support inline text and client tools; multimedia, file references, and hosted tools are not enabled. Responses storage queries, compact, WebSocket, and Messages count_tokens are not implemented. Endpoint availability alone does not establish that a particular model and CLI have passed live validation; verify each before enabling it.

Chat conversion supports text, system messages, client function tools and multi-turn results, streaming text, and tool calls. Plain-text custom tools use an explicit `{input: string}` wrapper. A single level of Responses namespaces is mapped to collision-free function names, then tool names, namespaces, and call IDs are restored. Fields that cannot be converted equivalently—including native thinking, signed or encrypted reasoning, multimedia, hosted tools, nested namespaces, grammar, strict JSON schema, effort, and server-side safety extensions—are rejected before calling the provider. The [conversion schema](../packages/server-ai/src/model-execution/execution-chat-bridge-request.ts) defines the supported fields.

The compatibility list restricts Chat conversion to exact CLI versions. Models must also support streaming tool calls, and Codex additionally requires parallel tool calls. Runners must use the launch configuration validated for that version. Adding a version requires checking request shapes, multi-turn tool calls, cancellation, and per-call metering; changing a display version or allowing a provider name is insufficient.

The conversion layer checks input limits against the larger of the original and converted request byte lengths. Cancellation propagates to the same upstream call, and conversion does not create a second charge. Cache hints do not guarantee equivalent upstream caching behavior; cache tokens still come from actual receipts. When only estimates are available, the call fails and retains a record pending reconciliation. A CLI's own cost estimates cannot replace the platform ledger.

## API and Identity Boundaries

The following paths include the platform's `/api` prefix.

| Endpoint                                                   | Caller identity                                                 | Purpose                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET/PUT /api/model-execution/admin/policy`                | Tenant scope with `MODEL_GATEWAY_MANAGE`                        | Read or update the rollout policy                                          |
| `GET /api/model-execution/admin/pending`                   | Platform administrator in tenant scope with the same permission | Paginate usage awaiting reconciliation                                     |
| `POST /api/model-execution/admin/calls/:id/reconcile`      | Same as above                                                   | Persist evidence and reconcile the original call                           |
| `POST /api/model-execution/admin/calls/:id/retry-delivery` | Same as above                                                   | Retry ledger delivery of an existing fact                                  |
| `GET /api/model-execution/openai/v1/models`                | Execution credential                                            | List model aliases available to the current grant                          |
| `POST /api/model-execution/openai/v1/chat/completions`     | Execution credential                                            | Standard Chat                                                              |
| `POST /api/model-execution/openai/v1/responses`            | Execution credential                                            | Native Responses or explicit Chat conversion                               |
| `POST /api/model-execution/anthropic/v1/messages`          | Execution credential                                            | Native Messages or explicit Chat conversion                                |
| `GET /api/model-execution/call-options`                    | Platform user in organization scope                             | List the user's Assistant filter options                                   |
| `GET /api/model-execution/calls`                           | Platform user in organization scope                             | Query the user's calls, estimates, and settlement states                   |
| `POST /api/model-execution/revoke-mine`                    | Platform user                                                   | Explicitly revoke the user's active execution grants in the current tenant |

Both `calls` and `call-options` are restricted to the current tenant, organization, and user. They do not accept ChatKit client secrets or other API principals. Queries can filter by entry, status, Assistant, conversation, execution ID, tool, model, environment, usage source, pricing state, and time. The [query schema](../packages/server-ai/src/model-execution/execution-query.schema.ts) and shared `ZodValidationPipe` convert and validate parameters at the HTTP boundary. Ordinary users cannot query another user's charges by changing filters.

The personal execution usage page displays actual usage, estimates, reservations, and pricing state. The administrator ledger view retains existing management permissions and supports exporting the current page. The `:id` in administrator reconciliation paths is `items[].id`, the database record UUID, rather than `callId` or `attemptId`. `applied` only means that evidence was applied; it does not mean ledger delivery succeeded. Check `delivered`. Reconciliation confirming zero usage requires no actual usage delivery.

Computer starts and stops through its controlled View Actions; managed tasks use Agent Invocation capabilities. ChatKit user-facing business APIs are centralized under `/api/ai` in `AIModule`. Execution model endpoints validate dedicated execution credentials and must not reuse login identity or expose management endpoints to client secrets.

## Long Tasks and Results

The model authorization service does not decide how a parent Agent waits. Ordinary long tasks use [bounded observation](../packages/server-ai/src/runtime-task/README.md): launch returns a task handle, and the Agent observes that same task through `task_status({taskIds, timeoutMs, mode})`. The default wait is 30 seconds, the default upper limit is 60 seconds, and 0 requests an immediate status check. A timeout returns a normal `pending` result without an interrupt or a duplicate launch. The backend checks status within the observation window without invoking a model for each check.

Only interactions that actually require user confirmation may suspend execution. Canceling observation does not cancel the child task, and a persisted child-task receipt does not guarantee that the parent turn resumes automatically after an API restart. Results may contain analysis, changes, tests, files, and other types. ZIP packaging is not the default; collection and delivery require an explicit `files` or `archive` request. Export failures and execution failures are recorded separately. Result tools display ChatKit resource cards, which do not themselves grant access. See [result and runner constraints](../packages/server-ai/src/agent-invocation/README.md) and the [resource card protocol](../packages/plugin-sdk/RESOURCE-CARDS.md).

## Deployment Rollback and Validation

Deploy with the feature disabled first. Contracts, SDK, host, ChatKit, and runtime plugins must use compatible builds from the same release cycle. Published packages and release receipts determine official version numbers; a local prerelease version is not evidence of an npm release. Older SDKs lack the capabilities described here, so upgrading only a runtime plugin is insufficient.

Once the base model gateway tables exist, apply these incremental migrations in dependency order before starting the full updated API and workers:

1. [Agent Invocation base tables](../packages/server-ai/src/agent-invocation/migrations/20260922-agent-invocation.sql).
2. [ModelExecution base tables and usage fields](../packages/server-ai/src/model-execution/migrations/20260930-model-execution.sql).
3. [Execution usage audit](../packages/server-ai/src/model-execution/migrations/20261001-execution-operations.sql).
4. [Legacy wait records](../packages/server-ai/src/agent-invocation/migrations/20261001-invocation-wait.sql), followed by [wait-group compatibility](../packages/server-ai/src/agent-invocation/migrations/20261002-task-wait-groups.sql). New ordinary waits do not write these records, but legacy monitors still depend on the complete schema.
5. [Shell execution receipts and pending grants](../packages/server-ai/src/model-execution/migrations/20261003-shell-launcher.sql). This migration depends on the existing `xpert_agent_execution` table. It can be rerun and preserves historical grants and usage.

Confirm that old workers have exited, then validate with dedicated test accounts and workspaces, small token budgets, and explicit environment instances. Roll out standard Chat, native protocols, and Chat conversion separately. Successful installation or policy persistence does not establish that live execution, metering, and file delivery have passed validation.

To roll back, first set `{ "enabled": false }` and stop dispatching new tasks. Disabling admission does not delete historical facts or reservations for unknown usage. Retain querying, explicit cancellation, and compensation capabilities. Follow the [operations runbook](operations/model-execution-runbook.md) to handle usage and legacy waits before stopping the relevant workers. Revoking a grant does not prove a process has exited. When its status cannot be confirmed, retain `unknown` rather than restarting the original task to guess at recovery. Rolling back incremental migrations must not DROP historical data.

Run the basic builds and type checks from the repository root:

```sh
NX_DAEMON=false corepack pnpm nx run-many -t build -p contracts plugin-sdk --skip-nx-cache
corepack pnpm exec tsc -p packages/server-ai/tsconfig.lib.json --noEmit --incremental false
corepack pnpm exec ngc -p apps/cloud/tsconfig.app.json --noEmit
```

Run targeted ModelExecution, model-gateway, Invocation factory, and usage ledger tests appropriate to the change. Plugins must verify compatibility between their build artifacts and the host. PostgreSQL integration tests require an explicitly configured `XPERT_EXECUTION_TEST_DATABASE_URL`, with a database name beginning with `xpert_execution_test_`; it must not point to the application database. Live acceptance must additionally cover isolation between Assistants and accounts, cancellation, restarts during execution, unknown states, per-call metering, and the final installation package. Unit tests do not replace these checks.
