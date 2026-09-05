# Assistant Profile implementation and acceptance

Date: 2026-09-03. Scope: the approved [implementation plan](PLAN_assistant_profile_hover_card.md).

## Installed environment

The selected source checkout is `/Users/xpertai/Pro/xpert`, branch `develop`, base
commit `03fa0f301077a9e00cc24cde5fde8ceb7a4a073b`. API 3333 and UI 4300 both return
HTTP 200 and their listening processes belong to this checkout. Other checkout
processes on 3000/4200 were preserved. The environment inspector reported `ready`
with no issues and confirmed the plugin workspace allowlist.

Factory Operations 0.5.0 was refreshed through `plugin:deploy:local`, then the
selected API was restarted. The authenticated runtime descriptor reports
`loadStatus: loaded`, no load error, and no SDK compatibility warnings. Its runtime
uses the paired local contracts/plugin SDK build. Public packaging requires the
coordinated release described in the changeset.

The local Managed Queue prefix is `xpert:managed-queue:3333`. This prevents the
separate checkout sharing Redis from consuming this checkout's tasks. The
task-owned PostgreSQL test container and temporary credentials were removed after
the integration suite; platform services and the accepted simulation Case remain.

## Real platform acceptance

A fresh simulation Case was created through the Workbench, processed by the
coordinator and specialist Assistant Tasks, and approved in the Profile confirmation
dialog. The card was closed immediately after the approval response. Background
execution and a real verification Assistant Task subsequently completed.

| Evidence               | Observed result                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Case                   | `FAC-260903-33FF5F`, `33ff5f80-3c3e-48f7-af7d-6bf5253c2a5e`                            |
| Final state            | `recovered`, revision 10                                                               |
| Approval               | Human approval at revision 8                                                           |
| Execution              | Revision 9, 12 explicitly simulated confirmations                                      |
| Continuation           | `0f275c9b-944b-4729-a895-f3330b9dc1fd`, `completed`, step `complete`                   |
| Verification Task      | `7d7cdb07-5cb0-4049-a76e-cd1ee477649f`, `succeeded`                                    |
| Verification execution | `5c694877-81b5-4c5d-b266-b49080b12e9d`                                                 |
| Business finalizer     | `recovered`, output revision 10                                                        |
| Dispatch identity      | Saved Case coordinator requested the verification specialist                           |
| Audit                  | `recovery_plan_approved_and_continue` → `recovery_plan_executed` → `recovery_verified` |

The approval audit occurred at 13:09:20 UTC and the verification audit at 13:09:35
UTC. This is live platform/model execution against a simulation Case; it is not
production equipment execution. External mode without an adapter remains blocked.

Browser inspection confirmed that expanded/collapsed sidebar entries expose the
Profile only from the avatar and render no separate information icon; hovering the
surrounding menu item preserves its original navigation behavior. Chat headers keep
their original menu behavior and add no Profile information button or standalone
header row. In-card details/confirmation, Escape priority and focus restoration
were also verified. At a 360×740 viewport the card measured 344px wide without
horizontal overflow. Selecting
Basic after a Remote View leaves the visited iframe mounted and hidden; returning to
the tab reuses the same iframe entry. Keyboard, gap crossing, busy holds, and final
disposal also have component/browser test coverage.

## Automated verification

| Check                                | Result and scope                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover Card                           | 3 passing component tests: delays/gap, iframe focus/Escape, held decisions/disposal                                                                                                   |
| Profile / renderer / ChatKit runtime | 38 passing targeted Cloud tests, including cached tab instances, single iframe initialization, opaque-frame handshake fallback, stale request cancellation and scoped client commands |
| Chat surfaces                        | Development Cloud build passes; chat headers retain their original menu behavior and the Profile remains avatar-only in sidebars                                                      |
| Profile endpoint / Agent host        | 10 passing tests for display whitelisting, published access, host features and scoped context                                                                                         |
| Profile indicators                   | 4 passing endpoint/service tests for whitelisting, version-family 30-day activity, Tool deduplication, disabled Tools, direct sub-agents, and partial-source fallback                 |
| View activation/schema utilities     | 11 passing tests, including required Feature activation                                                                                                                               |
| View service / permissions           | 10 passing tests; Profile Feature removal, undeclared actions and trusted multi-Feature provider projection are covered                                                               |
| Platform builds                      | contracts, plugin SDK, headless UI and development Cloud build pass; server-ai TypeScript check passes                                                                                |
| Factory checks                       | blueprint, backend/frontend typecheck, 31 unit/legacy integration tests, build and generated asset consistency pass                                                                   |
| Isolated PostgreSQL                  | 8 passing tests: membership/version/scope isolation, human roles, atomic outbox, rollback, stale/revoked/external blocking, checkpoint replay and bounded retries                     |
| Remote View browser suite            | All 5 tests pass; Profile includes 480px Chinese/light and 344px English/dark opaque-origin frames, cancel/reject, stable retry payload, Escape and no polling after disposal         |
| Plugin lifecycle harness             | Plugin loads and application context closes successfully                                                                                                                              |
| Skills                               | All 7 development skills validate                                                                                                                                                     |

The PostgreSQL tests invoke the actual plugin services/transactions and persistence
but stub the platform Task dispatch boundary. They prove service reconstruction and
queue recovery independently of the browser; the real Task evidence above proves
the installed end-to-end path. Browser verification covered the Chinese approval
flow and the English dark-theme case list without retaining screenshot artifacts in
the repository.

The Project provider projection regression now passes. The normalizer intersects
the trusted Host capability providers for every Feature required by a view and
ignores any provider list supplied by the plugin manifest. The Profile test also
confirms discovery, data and action rejection after Feature removal.

Secret-free local receipts and detailed logs are under `/tmp/assistant-profile-*`,
including `env-receipt.json`, `deployment.json`, `plugin-runtime.json`,
`live-evidence.json` and the named test logs. Tokens are excluded from these records.

## Cached Profile tabs follow-up

Updated on 2026-09-04 after network inspection. The Factory Profile performs one
request on its first activation and intentionally polls every five seconds. The
two immediate same-URL browser entries are one data `GET` and its CORS `OPTIONS`
preflight, rather than two backend data queries. The host now sends only one iframe
`init` per loaded document and cancels its blank-frame fallback once `ready` arrives.
A visited tab remains mounted
when another tab is selected; its iframe, UI state, and current data are reused.
While hidden it receives `viewActive: false`, cancels the scheduled poll, and
ignores an obsolete response. Returning sends `viewActive: true`, displays cached
data immediately without another initial request, and schedules the next poll.
Closing the Profile or changing Assistant still destroys all cached instances.

The refreshed local 3333/4300 runtime confirmed one initial `GET` plus one CORS
`OPTIONS`, the same blob iframe URL across tab changes, zero `GET`s during a 5.5s
hidden interval, zero immediate `GET`s after reactivation, and one `GET` after the
next five-second interval.

## Profile indicators follow-up

Updated on 2026-09-04. The Profile endpoint now returns its four indicators together
with the existing display whitelist, so opening the card does not create separate
browser requests for each number. Skills count the installed packages in the
Assistant's Workspace that pass the normal runtime Workspace-access boundary, minus
Skills disabled for that Assistant binding. The count is independent of whether the
primary Agent currently mounts Skills Middleware. Tools are unique enabled names exposed by the primary Agent's direct
Toolsets and Middleware. Sub-agents are unique direct internal and External Assistant
connections. Conversation activity excludes debugger sessions and covers the same
Assistant's published-version family during the rolling previous 30 days in the
current tenant and organization. A failed optional Skills or conversation source is
rendered as an em dash while the rest of the Profile remains usable.

Browser verification against the installed 3333/4300 environment showed the
coordinator Profile with 0 Skills, 4 unique Tools, 8 direct sub-agents, and 1
conversation in the rolling window. All four values rendered in a single compact
row above the tabs while the existing Basic and plugin views remained usable.

After aligning the Skills indicator with Workspace access on 2026-09-04, a second
published Assistant whose Workspace contains 37 installed Skills rendered 37 even
though its primary Agent does not mount Skills Middleware. The same live check kept
the Assistant's other values at 4 Tools, 7 direct sub-agents, and 1 recent
conversation. The zero-Skills result above remains correct for the separate
coordinator Workspace, which currently has no installed Skill packages.
