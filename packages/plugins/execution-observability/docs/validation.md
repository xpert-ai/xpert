# Implementation validation and handoff

Validated on 2026-10-27 in `/Users/xpertai05/tiwen/xpert-execution-observability`, branch `codex/execution-observability`, based on `fb89f5af7094e0a6b5f6f76f201d96635cd02b3b` (xpert develop).

## Delivery

- Built-in `@xpert-ai/plugin-execution-observability`, View, five read-only middleware tools and an administrator Assistant template.
- Existing-record SQL service exposed through a host-bound SDK capability; current role and organization membership are rechecked for each operation.
- Assistant interval summaries, expandable conversation/thread lanes, overlap trend, details, list, filters, bounded analysis, usage coverage, period comparison and anomaly candidates.
- Shared shadcn/ui + Tailwind utilities. The observability feature adds no persistent tables, entities, migrations or collection workers. A separate existing shared-DB migration dependency is retained below.
- API default registration, workspace/build/deployment packaging and generated-asset verification are included.

## Automated results

98 selected tests have passed across the following suites (not a full repository test run). Of these, 93 were rerun during real integration; the 3 unchanged contract and 2 preview-host tests retain their earlier passing result:

| Area                                    | Passed | Coverage                                                                                                       |
| --------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------- |
| Contracts                               |      3 | Strict scope/range/page validation, time offsets, anomaly bounds                                               |
| Interval metrics                        |      4 | Half-open bounds, gaps, tied endpoints, unknown ends, completion-only duration samples                         |
| Access policy                           |     11 | Live role/membership checks, restricted credential audiences, no tenant-wide fallback                          |
| PostgreSQL integration                  |      5 | Real SQL, scope/soft deletion, pagination, aggregation, explicit delegation, detail/children, usage, anomalies |
| Host module DI                          |      1 | Actual Nest module wiring and fail-closed identity                                                             |
| Plugin/View/tools/navigation            |     11 | DI, five tools, stable capability IDs, connected feature, template and navigation roundtrip                    |
| Existing middleware runtime regressions |     61 | Runtime service, project purge and tool images                                                                 |
| Shared preview host                     |      2 | Built asset forwarding and wrong-instance rejection                                                            |

The PostgreSQL suite used **connection-local TEMP fixtures** with synchronization/migrations/extensions disabled. It did not create persistent tables or alter shared platform records. It checks real PostgreSQL query behavior against fixture schemas; the subsequent authenticated API run also verified the actual shared schema. Fixtures now match production ledger organization IDs (varchar) and entity soft-delete availability.

Build/check results: contracts and SDK builds; production plugin build and matching source/dist assets; API build; server and remote View TypeScript checks; API build/production frozen-lockfile checks; `git diff --check`. API webpack emitted three existing dynamic-dependency warnings. One initial runtime test run loaded an unrelated thread-run-control type graph; an explicit observation-service DI mock isolated the runtime unit test, after which all 57 runtime-service cases passed.

## View acceptance

The shared preview is available at `http://127.0.0.1:4419/` while its local process is running. It uses labeled synthetic fixtures and the production-generated bundle. Root `design-qa.md` contains visual comparison results, corrections, browser evidence and limits. Screenshots are stored in `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-implementation/`.

## Real-platform integration (2026-10-27)

The user subsequently requested complete real acceptance and signed in on Cloud 4300. Preserved local edits, pulled develop with `git pull --ff-only`, installed frozen dependencies on Node 20.20.2, and rebuilt/restarted this worktree. API 3300 readiness and Cloud 4300 passed; existing 3000/4200 services remained untouched. Both use the authorized shared DB/Redis.

### Shared database migration prerequisite

The shared DB already contains `compute_resource_operation`. Its ownership migration is not yet in upstream develop. This worktree includes the exact source-owned component manifest, SQL and check from `/Users/xpertai05/tiwen/.worktrees/xpert-pro-compute-resources` (branch `codex/organization-compute-resources`, base `b29d55c96`), plus its deployment manifest entry. The SQL checksum matches the already-applied shared-DB migration: `648498e5184bdf118dae930042f2efdb914cb2ee42673aaddcac873b382a115c`. Normal schema apply/verify passed; no guard bypass, baseline reset or new observability table was used. Coordinate this dependency when merging; its owning worktree was not modified.

### Real integration corrections

- Native ChatKit delegates through USER_XPERT client-secret sessions. Accept only the same Assistant/user session; recheck persisted session expiry/revocation, original Assistant grant, role, tenant, organization and active membership on every operation. Public/enterprise/conversation/API credentials remain rejected.
- Support remote assets when the local plugin loader imports TypeScript source as well as packaged JS.
- Use separate ledger tenant/organization SQL parameters: production ledger organization ID is varchar while execution organization ID is UUID.
- Display `Assistant.title` with `name` fallback rather than internal machine slugs.
- Mark the template's analysis middleware required: otherwise ChatKit's empty optional-plugin selection removes the tools from a new conversation.
- Show an explicit boundary for other Assistants' conversation content, while preserving their authorized execution detail. No host authorization widening.

### Live Assistant and evidence

Created **执行管理助手** through the normal template installation and publication UI in **Default Workspace**, under **南京元数信息技术**. Assistant ID: `1897e9ad-0298-464f-992f-8550d256d32b`; model `gpt-6-astra`, per-Assistant reasoning `medium` (provider defaults unchanged).

Evidence directory: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-real-acceptance/`. Real View mounts through authenticated native ChatKit and reads shared platform records, with no synthetic badge or fixtures.

Fixed window: `2026-10-26T09:50:40.166Z` to `2026-10-27T09:50:40.166Z`, Asia/Shanghai, root executions, `asOf=2026-10-27T09:50:40.260Z`. Real summary tool and independent read-only PostgreSQL both found **19 executions, 12 success, 7 error**, across 2 Assistants / 15 conversations. P50 193.459 s, P95 1213.979 s; 15 executions have direct usage links, 694,973 tokens. Recorded interval-overlap peak 1 does not establish active concurrency.

Real failed-detail drilldown: `aa3fd0d3-504c-4902-a53b-334747671f0b`, AIGoCode Astra · #1235 本地测试, reported 492.41 s. Source, recorded creator, thread, child count and unknown usage are displayed.

The initial xhigh trial called the real summary tool but terminated before completing analysis; a second trial exposed missing optional-tool activation. These trials are retained as real records and are not counted as successful analysis acceptance. The required-middleware trial confirmed automatic tool activation and a 51 ms real summary query, but its subsequent model stream ended with `ECONNRESET`; the earlier xhigh trial had `UND_ERR_BODY_TIMEOUT`. These are recorded as failed trials, not successful analysis. For the final retry, only this worktree API routes the configured model endpoint through the macOS system proxy (127.0.0.1:7890) using a temporary Undici dispatcher preload; TLS validation, shared provider credentials/settings and other services remain unchanged.

Browser acceptance passed: deep-link navigation into the real conversation restores the paused 17:20–18:20 window and expanded Assistant rows; switching to list mode then browser Back/Forward restores each mode; refreshing the list route retains range, mode and pause state. The tested original-Assistant drilldown now shows the explicit conversation-access boundary.

### Completed real analysis

The resumed real run **succeeded** on 2026-10-27 18:35 Asia/Shanghai, execution `931c9fda-c967-4005-bdfe-d9328f2dac6e`, elapsed **80.887 s**. The same conversation retains the genuine summary result and the resumed run calls `execution_query` (**51 ms**) then `execution_get` (**32 ms**). Persisted message components independently confirm both tools have status `success`; they are not inferred from model prose.

The Assistant returned the verified 19 / 12 / 7 counts, rates 63.16% / 36.84%, P50/P95 durations, 15/19 usage coverage, and inspected failure `35176c19-d840-487f-99c2-38bbf36f0028` (399.32 s, no direct children). It separates missing error-cause evidence, missing usage and lifecycle overlap from actual concurrency. Reloading the real conversation preserves the final answer and successful tool components.

Open the accepted conversation at `http://localhost:4300/chat/x/assistant-1897e9ad-0298-464f-992f-8550d256d32b/c/62d9f952-2d1c-40cc-8b38-c94817ae004b`. Screenshots: `real-analysis-complete.png`, `real-collapsed-current.png`, `real-expanded-current.png`, `real-detail-current.png`; machine-readable evidence: `analysis-verification.json` and `database-verification.json`.

Final runtime: API PID 66535 and Cloud PID 14021 both resolve to this worktree. API readiness passes. The model endpoint uses the existing system proxy through `/tmp/xpert-observability-network.cjs`; local launch adds `NODE_OPTIONS=--require /tmp/xpert-observability-network.cjs`. This is local environment plumbing, not a plugin production dependency; keep a reachable configured model service in the deployment environment. Original API/UI 3000/4200 remain running.

Scope: authenticated administrator success path is accepted. Cross-tenant/organization and revoked-role/session checks have automated coverage; no second-user UI session was created. Current-Assistant conversation navigation still delegates to host authorization. The comparison tool has automated coverage but was not invoked by the final model runs. The anomaly tool was also verified in the parallel acceptance below.

Useful local checks from the worktree root:

```sh
corepack pnpm -F @xpert-ai/plugin-execution-observability build
corepack pnpm -F @xpert-ai/plugin-execution-observability test
corepack pnpm exec tsc -p packages/plugins/execution-observability/remote-components/timeline/tsconfig.json --noEmit
corepack pnpm remote-view:preview --config packages/plugins/execution-observability/remote-components/timeline/preview.config.mjs --port 4419
```

For the opt-in PostgreSQL suite, load the ignored DB environment through dotenv, set `EXECUTION_OBSERVABILITY_PG_E2E=1`, and run `packages/server-ai/src/xpert-agent-execution/observability/observation-postgres.integration.spec.ts` with `packages/server-ai/jest.config.ts`. Do not print or put DB credentials on the command line.

## Real parallel-conversation acceptance

Two independent conversations of the published administrator Assistant were submitted through the normal UI at 18:41:02. Both completed successfully using actual model responses and shared DB queries:

- `ad11f83a-bc33-4148-a79d-e22b4d27224a`: execution_summary, 35.255 s reported elapsed, tool 68 ms.
- `63785813-ea38-4876-9cc5-f52d65bc95bb`: execution_find_anomalies (failed), 52.035 s reported elapsed, tool 32 ms.

Their recorded lifecycle intervals overlap for **34.874 s**. The real View first displayed two running records, then both completed. In the 18:40–18:43 window, the collapsed Assistant row retains an aggregate segment labeled **2**, and the expanded View shows two separate conversation rows with their own execution bars. This proves simultaneous real conversation handling and the observed-overlap visualization; it still does not measure CPU/model-active occupancy.

Evidence: `real-two-running.png`, `real-concurrent-collapsed.png`, `real-concurrent-expanded.png`, `concurrency-running.json`, `concurrency-complete.json`. The first database sample was taken after one request completed; the earlier two-running state is proven by the View screenshot, and actual overlap by the persisted start/end timestamps. No fixtures or direct database writes were used for these executions.

## Compact timeline and lazy loading — 2026-10-27 follow-up

Implemented in `codex/execution-observability` (`xpert-execution-observability` worktree). `git pull --ff-only origin develop` reported up to date; frozen dependency installation passed. API 3300 was restarted through the normal libraries/API build, database apply and structure verification lifecycle. Health reports database/storage/cache up; Cloud 4300 returns HTTP 200. Existing 3000/4200 services were not stopped.

- Assistant rows: 60 px; single-lane conversation rows: 52 px, with 44 px per additional overlapping lane. Browser DOM measurements confirm both on real data. Header/chart are compact; week ruler labels use month/day.
- Mouse drag pans both axes after a 5 px threshold. Scrollbars, touch/trackpad and keyboard remain available; the ruler still selects a time range. Tested real dragging followed by ordinary pointer click on a short task at the right edge: the corrected hit target is a BUTTON and opens the real detail. A gutter and zero horizontal padding for narrow bars prevent overlay scrollbars intercepting it.
- Static image/emoji avatars use existing Assistant records; stored Emoji Mart IDs resolve server-side. Initials are the fallback. No new database table or migration belongs to this feature.
- Initial overview omits all execution details and usage ledger. Expand loads one 50-record Assistant page, maximum three reads in flight. Current-page memory is reused on collapse/reopen; query/snapshot changes reset it. Summary usage loads only when its dialog opens.
- Generated script: 1,556,361 bytes before → 1,085,163 bytes after (30.3% reduction), replacing ECharts with a small SVG step chart. This measures bundle bytes, not a claimed network-latency benchmark. Exact-summary guards (20,000 facts, 2,000 global/4,000 page interval segments) remain in force.

Validation: 13 plugin/provider/navigation/request-queue tests, 6 PostgreSQL integration cases and 4 interval-metric cases passed (23 focused cases; not the full repository suite). Remote and server TypeScript checks passed; production plugin build and shipped/generated asset parity passed. PostgreSQL fixtures use connection-local TEMP tables only and verify deferred ledger loading, scoped pagination, avatars, summary invariance and existing data boundaries.

Representative browser fixture: 610 synthetic executions, 605 on one Assistant. First load sent only overview; expansion loaded 50, next page replaced the records, collapse/reopen added no read, opening summary added exactly the summary operation. Drag changed both axes (horizontal 95 px, vertical 190 px); ArrowDown subsequently moved vertical scroll to 230 px. Ruler selection issued a new 10:10–10:19 query without panning. Light and dark, 900×720 and 1491×1055 layouts were checked. No synthetic records were written to the shared database.

Installed-platform pass: existing 执行管理助手, query 2026-10-20 22:13 to 2026-10-27 22:13 Asia/Shanghai, including delegated Assistant calls, returned 20 Assistants and 98 executions. First page has 10 rows. Expanding 执行管理助手 showed 6 executions in 5 conversation/thread rows. Real detail `63785813-ea38-4876-9cc5-f52d65bc95bb` returned completed, reported 52.04 s and 14,711 tokens. Deferred period summary returned 80.23% completion success and 91 executions with linked usage. Refresh retained query, paused mode and expanded Assistant.

Evidence directory: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-compact/` — `real-collapsed.png`, `real-expanded.png`, `real-detail.png`, `real-summary.png`, `large-drag-scroll.png`, `preview-dark.png`.

## Time density and conversation/thread grouping (2026-10-28)

Current branch was inspected and preserved, `git pull --ff-only origin develop` was up to date, and Node 20 frozen dependency installation passed. API 3300 was restarted through the normal build, database apply and schema verification lifecycle. Health passed; the original 3000/4200 services were not stopped. No table or persisted execution was added for this feature.

- 16 plugin/unit tests passed, including public navigation state, zoom anchoring, bounded ticks and half-open overlapping root/child lanes. The 3 layout tests were rerun after the fit-width adjustment.
- 7 PostgreSQL integration tests passed using connection-local temporary tables. New coverage verifies whole-conversation pagination, scoped conversation/thread filters, actual thread parent/fork metadata and the difference from child execution relationships. Production execution data was only read.
- Server TypeScript check passed; production build and generated/distributed asset verification passed. The remote strict-null check has no errors in the View, but is **not a clean workspace typecheck**: it reports 47 diagnostics in 12 unchanged files imported by the contracts barrel (graph, interrupt, utils, configuration, usage and knowledge models). The stricter setting is retained; unrelated contract code was not modified.

Authenticated UI evidence:

- The reported BW conversation `8ec28799-f7bc-4512-b5c0-66fe68e6d65e` has one thread, `0c93fe2d-ea7e-4f2e-ba05-79bf33db311f`. Root `96584bda-9eaf-4513-a760-9238bf50c95e` failed at 01:07:06.590 on October 25 (Asia/Shanghai). Its successful sub-agent child `4cf54865-af43-5127-a3b4-8b877e7c95a4` ran 01:05:55.153–01:06:23.653. Both thread fork fields are null. The real View reports one thread, two executions and one child call; both detail dialogs and the child-to-parent link were checked. This is not a thread fork.
- Conversation summary height is 52 px. Its execution details appear only on expansion and identify root versus sub-agent calls. A separate synthetic conversation verifies two real metadata-linked threads with one branch, labeled with its parent thread.
- At real weekly 64× zoom, the canvas is 71,152 px wide in a 1,411 px viewport, while only eight time ticks are rendered. A 383 px horizontal pan followed by zoom preserved the intended inspected area; the original query range stayed unchanged.
- In the 612-record synthetic fixture, initial load made one overview request, expanding an Assistant made one 25-conversation request, collapse/reopen reused that page, and page two made one additional conversation request. No list or ledger/summary request was issued during these actions. There are 603 conversations under the largest Assistant, with 25 summary DOM rows and zero hidden thread-detail rows.

Evidence: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-zoom/`. The week and focused conversation screenshots are real authenticated data; files named preview/large use explicitly labeled synthetic data. Browser pan offsets are intentionally ephemeral; zoom and expanded-conversation navigation state persist. This increment does not claim a new model-driven analysis run or production-scale load benchmark.

## Mouse-wheel zoom and service handoff — 2026-10-28

- Preserved worktree changes; fast-forwarded develop to `97dc27aac`; Node 20.20.2 frozen pnpm installation passed.
- Added pointer-anchored native non-passive wheel handling, normalized delta modes, burst limiting and visible interaction hints. Left-column scrolling, horizontal gestures and Shift-wheel remain native.
- 19 plugin/unit tests passed. New tests cover off-center time anchoring through zoom in/out, pixel/line/page deltas, fit/64× limits and high-frequency trackpad bursts. Build and generated/distributed asset verification passed. Remote strict checking retains the same 47 diagnostics in unchanged contracts files and none in this View.
- Restarted this worktree API 3300 through its normal build/migration/schema verification lifecycle and started Cloud 4300. Both health/reachability and source process provenance passed. Shared DB/Redis and original 3000/4200 services were preserved.
- Browser acceptance is **not claimed for this increment**: the signed-in host loaded, but the automation browser left its ChatKit iframe at `about:blank`; CDP explicitly reported a paused document response being resolved by Browser Use. One reload and a fresh tab had the same result. No browser protection was bypassed. The duplicate tab was closed; user testing remains the final wheel-interaction check.

Logs: `/tmp/xpert-observability-wheel-api.log`, `/tmp/xpert-observability-wheel-cloud.log` (may contain runtime credentials; inspect only narrowly filtered diagnostics). Secret-free handoff: `outputs/xpert-execution-observability-wheel/environment.json`.

## Progressive disclosure and shared icons — 2026-10-28

- Removed the always-visible lifecycle note and 64 px trend row. A labelled information button in the existing status row opens a shadcn Popover containing the limitations, unknown-end count, full date range, peak and overlap chart. The chart mounts only when opened and reuses the overview response. No schema, table or query change.
- Replaced the shared Remix font-class icon with the same static inline SVG for View, middleware and template metadata. The ChatKit font consumer depends on an iframe font; the historical Provider icon handler does not serialize font definitions. The running `3300/api/xpert-toolset/builtin-provider/execution_observability.analytics/icon` now returns HTTP 200 with `image/svg+xml`.
- `git pull --ff-only origin develop`: already current at `97dc27aac`; frozen install completed with Node 20.20.2 / pnpm 10.24.0; existing dirty changes preserved. API reloaded the new icon, Cloud was restarted on 4300, both listeners resolve to this worktree. API database/storage/cache healthy; Cloud HTTP 200.
- Plugin build / generated-asset freshness verification passed; all 19 plugin tests passed; `git diff --check` passed. Strict remote TypeScript check still reports 47 pre-existing contracts diagnostics, with none under this plugin.
- Generated-asset preview browser acceptance passed: default notes/chart absent, click and Enter open, Escape dismisses and returns focus, popup fits inside the iframe. At the tested 1512 × 751 viewport, the timeline remains y=149 / height=558 both closed and open; popup is x=346.5 / y=147 / width=384 / height=261.5. Screenshots are synthetic preview evidence, not live records.
- The runtime now applies the existing local-frame URL normalizer, so `/chatkit` resolves directly to `/chatkit/index.html` without a directory redirect. The two frame URL/runtime suites passed all 25 cases. The browser also independently showed a document request stalled before the iframe code ran; this is not evidence that the redirect was the sole cause of the blank page. Direct entry navigation succeeded, and the original authenticated page subsequently loaded after a normal reload without user intervention or changes to browser protections.
- Historical tool events retain their stored font icons. Cloud now prepares the installed ChatKit entry with a local Remix Icon stylesheet and copies the existing official font assets during build/serve; dependency files and stored messages remain untouched. Both entry-preparation tests passed. The live historical `execution_summary` icon has `font-family: remixicon`, a non-empty pseudo-element glyph and a loaded font; the View tab renders its 16 × 16 SVG. The new provider icon endpoint also returns SVG.
- Authenticated UI acceptance passed with 20 Assistants / 98 executions. The notes popup displays the full October 20–27 date range and singular unknown-end text. Opening it leaves the timeline at y=130.5 / height=533 inside the View iframe; Escape dismisses it and restores trigger focus. Wheel over the real chart changes Fit width to 2×; a horizontal drag changes scrollLeft from 364 to 564 px. The final page was returned to Fit width. No new Assistant invocation or stored-message migration is claimed.
- A second normal host reload also displayed the actual conversation, both icons and the 98-record timeline. Final listeners: API PID 17420 and Cloud PID 34221, both in this worktree; API health is OK and Cloud returns HTTP 200.
- Evidence: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-disclosure/` contains `real-compact.jpg`, `real-notes.jpg`, the two explicitly synthetic `preview-*.jpg` files, and `environment.json`.

## Keep the overlap trend visible — 2026-10-28

- Restored the overview step chart inside the shared timeline canvas and sticky header. It shares the task rows' time coordinates and wheel, horizontal scroll and drag behavior. Hover displays a vertical crosshair, timestamp and recorded execution count; idle gaps display zero. Left/Right/Home/End keyboard inspection is also available. Lifecycle limitations and unknown-end counts stay in the information popover. The chart reuses the existing summary payload without another query or charting dependency.
- Fast-forwarded the worktree to develop `0f06bf075`; the three local observability translations were temporarily stashed and reapplied cleanly, preserving all other local work. Node 20 frozen dependency installation passed, followed by service rebuild/restart on the existing 3300/4300 ports.
- Plugin build, generated/distributed asset parity, 22 plugin tests and `git diff --check` passed. New cases cover half-open counts, idle gaps, edge clamping and matching task/hover timestamps through 1×–64× zoom and scroll offsets. No new database schema or record changes.
- Browser acceptance: in the synthetic preview, chart and task rows both measure width 2,348 px at 2×; dragging the chart moves both from x=-390 to x=-640. Hover at x=1,000 places the crosshair at x=1,000 and shows 10:31 / count 1; separate checks show peak 5, idle 0 and keyboard inspection. These preview records are synthetic.
- Authenticated platform acceptance: 20 Assistants / 98 actual executions. Chart and task rows are both 735 px wide at Fit width, then 1,470 px at 2×; their x positions both change from 303 to -51 on wheel zoom and then to -251 after a 200 px drag. The real hover displays October 25 06:00 / count 0. The actual chart is 42 px tall under the host's 14 px root size. The initially delayed ChatKit document completed loading; no browser protection was changed.
- Evidence directory: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-trend/`, including `real-synced-hover.jpg` and the clearly labeled synthetic `preview-synced-hover.jpg`.

## App presentation and cover — 2026-10-28

- Added an organization-scoped marketplace App linked to the bundled `execution-administrator` template, with localized presentation, primary-model requirements and a dedicated private workspace declaration. This change does not initialize an App installation or duplicate an existing Assistant.
- Packaged the imagegen cover (`assets/branding/cover-v1.png`, 1,230,317 bytes) and portable manifest asset declaration. The cover is explicitly illustrative. App configuration remains defined once in TypeScript; the portable manifest only declares the asset.
- Inspected the dirty worktree, pulled develop with fast-forward only (HEAD `0f06bf075`) and ran Node 20 `pnpm install --frozen-lockfile`. API restarted through its normal workflow on port 3300 from this worktree; health passed. Cloud 4300 returned HTTP 200.
- Plugin build and asset parity checks passed. All 24 tests in 5 plugin suites passed, including App-to-template linkage and local screenshot declaration checks. npm pack dry-run includes both `.xpertai-plugin/plugin.json` and the PNG. `git diff --check` passed.
- Authenticated browser acceptance: Explore → Applications lists Execution overview. Its actual detail page shows the existing SVG icon, new cover, four features, organization scope, data scope and setup-required state. The image loaded as a host-resolved inline PNG at 1672 × 941 pixels. No App initialization was submitted.
- Evidence: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-app/app-detail.png`. Detail URL: `http://localhost:4300/explore/apps/execution-observability?plugin=@xpert-ai%2Fplugin-execution-observability`.

## Main checkout integration — 2026-10-28

- Rebased the reviewed change onto upstream develop `1be15b9ce`. Added the required UI application Changeset declaration and excluded generated plugin View bundles from Prettier, matching the existing host-bundle policy.
- Repository commit hooks completed, including release declarations, source formatting, workspace/deployment lock synchronization, color rules, TypeORM column types and RequestContext imports. Frozen dependency installation and the plugin build/asset parity check passed after integration.
- 122 selected tests passed: plugin 24, contracts 3, observation/runtime supporting suites 20, middleware runtime service 57, ChatKit runtime 16 and entry preparation 2. The runtime test fixture now supplies `conversations`; direct command/service imports keep this unit suite from loading unrelated file-understanding and conversation-control modules. This is targeted regression coverage, not a full repository test run. PostgreSQL and browser results above retain their original run dates.
- The packaged timeline SVG logo was also checked at 16/24/32/64/128 px on light and dark backgrounds and in the authenticated App marketplace/detail page. Evidence: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-icon/`.
