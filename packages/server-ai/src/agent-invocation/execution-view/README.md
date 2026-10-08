# Independent Coding Execution View

An execution is an `AgentInvocation`. Project Tasks supply links and acceptance decisions; they do not own or collect the CLI transcript. The built-in view key is `platform.coding-execution__execution`, with `selectionId = invocationId`.

## Boundaries

- A Runtime Strategy optionally declares `capabilities.activity = { version: 1, presentation: 'coding' }`. The invocation pins that declaration at start. An older strategy needs no changes.
- The host supplies an optional, invocation-scoped `context.activity` recorder. `readCheckpoint()` and `append()` expose no tenant, owner or invocation override. The adapter maps its public protocol into the contracts package's message/tool/diagnostic union.
- The existing observation monitor collects dispatch runs **and** activity-enabled direct runs. Collection continues without a browser. It renews its observation lease while inspection is active.
- `InvocationActivityService` stores immutable item updates and the source cursor in one transaction. Stable item IDs, canonical content hashes and cursor comparison make overlapping observations idempotent. A completed tool cannot regress to its old running event.
- `ExecutionReaderService` checks owner, tenant, organization, project, Assistant/conversation scope and current binding access. It does not inspect a CLI or require a live adapter. A deleted/disabled binding revokes reading; an unavailable strategy alone does not erase authorized history.
- `CodingExecutionProvider` projects public fields and handles output pages and pinned artifact downloads. Runtime control handles, configuration and arbitrary result data are not returned. The generic result provider uses the same pure reader.
- `InvocationCardProvider` owns creation and refresh of direct invocation cards. Project cards remain in `ProjectTaskCardProvider`; task execution IDs are resolved to invocation IDs before navigation. Thread activity refreshes cards and discovers Agent continuation runs, without collecting CLI content.

## Data and collection

Apply `../migrations/20261007-execution-activity.sql` before deploying the new runtime plugin when database schema sync is disabled. It adds two independent tables, with invocation foreign keys; existing executions are not replayed.

Each activity item has a stable `id`, discriminated `content`, committed `seq`, and `firstSeq`. Initial reads return the latest version of each item; subsequent reads coalesce upserts after the acknowledged sequence. Reads use a committed waterline and at most 100 items per page. Clients merge by ID and display by `firstSeq`.

The Computer JSONL bridge spools public events in its private runner directory. Pages include a source generation UUID, positions and a bounded cursor. Replacing the source records a gap instead of silently starting over. The bridge keeps draining stdout after the capture quota is reached. The bounded compatibility preview is not a complete transcript.

Normal finalization persists activity before the durable final result and runner cleanup. Cancellation and lost runners retain captured records and expose missing-tail diagnostics. Failed activity storage does not replace the execution result. If the final protocol receipt itself is unavailable, the adapter reports unknown/diagnostic instead of assuming success from process exit alone.

For OpenCode, the adapter reconciles cumulative messages/parts belonging to the current parent message. The fixed server version supports `limit` but not a backward cursor. If the bounded full response fails, the adapter marks a source gap and tries the latest message for final-result recovery. It never labels this fallback a complete history.

## Limits and retention

| Boundary                              | Value                                                    |
| ------------------------------------- | -------------------------------------------------------- |
| Guest JSONL spool                     | 32 MiB; draining continues after the limit               |
| Bridge page                           | Up to 50 events, bounded byte window                     |
| Public tool output contract           | Up to 2 MiB of text per item                             |
| Database output preview / output page | 65,536 characters                                        |
| Host activity budget                  | 32 MiB per invocation by default; at most 20,000 updates |
| Retention                             | 30 days from last capture/finalization by default        |

`EXECUTION_ACTIVITY_MAX_BYTES` accepts 1–128 MiB; `EXECUTION_ACTIVITY_RETENTION_DAYS` accepts 1–3650 days. Invalid values use the defaults. These are process environment settings.

Long captured outputs use immutable, content-addressed files in the existing private `runtime-jobs` volume (`activity-<invocationId>`). They are not mounted into the Computer project and are not published as Artifacts. A read must reference a recorded output key for the authorized invocation; no arbitrary path is accepted. Hourly cleanup removes expired process records and output files in bounded batches. Invocation metadata, final results and separately managed Artifacts retain their existing lifecycle. The view reports expired records explicitly.

Allowlisted public protocol fields exclude reasoning/system/control records. Known credential representations are redacted before storage; this is defense in depth, not a promise to recognize every possible secret inside arbitrary user-generated output. The view uses text nodes rather than executing output markup.

## UI and navigation

The same read-only remote component works in agent and project View hosts, Web and Desktop. It shows public messages, tool lifecycle, real command/exit code/captured output, explicit file operations, final result and pinned artifact downloads. Large messages and run metadata are collapsed. Follow can be paused while reading older output. The root font size inherits the host variable and defaults to 14px; the WebTUI transcript uses relative text-sm (0.875rem).

Visible views poll the host every two seconds; collection uses the existing monitor cadence. There is no new SSE bus, interactive terminal or approval/control UI. Hiding/closing the view stops its reads, not the CLI. Switching scope clears pending requests and cached items. Terminal/closed records stop polling.

- Task name → existing task Dialog.
- Task execution dot/row → authorized project-scoped Coding View (generic result View for non-Coding invocations; legacy Agent executions keep their original destination).
- Project execution resource card → the same invocation in the conversation's authorized workbench.
- Direct Coding invocation → one live execution card; its final summary is in the view. Independently delivered file cards remain available.

Web downloads use the existing cookie-bound file grant. Desktop intercepts only content URLs from its configured API origin and downloads through the login-authenticated `GET /api/workspace-files/view-sessions/:sessionId/grants/:grantId/content/:fileName` route. That route checks the original session owner/tenant/organization, expiry, download purpose and current View resource access. Account credentials remain in the native host; bytes stream into a temporary file and replace the user-selected destination only on success. This avoids depending on third-party cookies in the embedded ChatKit frame.

File operations describe only evidence emitted by this invocation. Shared-project Git status is never attributed wholesale to one Assistant. Execution success does not mean the business task passed acceptance.

An execution created before activity capture has no reconstructed transcript. Existing result/artifact data remain readable with an explicit “not recorded” state.

## Verification

See [implementation and acceptance record](../../../../../docs/plans/2026-10-07-coding-cli-execution-view-implementation.md). Protocol fixtures live with the runtime plugin; PostgreSQL integration tests cover transaction/cursor concurrency, large-output references, snapshot merging and retention. View tests cover scope boundaries, revoked bindings, unavailable adapters and pinned artifacts. Real CLI receipts stay in protected local acceptance storage rather than source control.
