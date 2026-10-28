# Data contract and boundaries

## Shared query

`from` inclusive / `to` exclusive ISO timestamps (offset required), valid IANA `timeZone`, at most 31 days; `asOf` is a clip boundary capped by server time. Records remain mutable and are observed at `observedAt`: this is not event-sourced historical replay. Filtering and pagination run in SQL; scalar summaries cover all matches, independently of the page. Defaults count root tasks; `assistant_invocation` also includes explicit `metadata.invocationKind` delegated Assistant calls. These units cannot be summed together.

Optional filters: Assistant UUID, workspace UUID, record-creator UUID (not necessarily end user or billed actor), exact recorded trigger source, statuses, title/Assistant-name search, and `unknownAssistantOnly` for missing Assistant identity. Tenant, organization and principal never come from the query.

The selected root/delegated record lifecycle is the available time envelope. Known ends and running-record envelopes are clipped to the window and `asOf`; missing terminal ends are markers, never stretched to the present. Half-open intervals and zero-length events do not create artificial overlap. Pending/interrupted records with unknown ends are counted/listed but cannot contribute an invented duration. A resumed record may include unknown waiting time inside its lifecycle. Success rate = success / (success + error + timeout); elapsed-time quantiles use only nonnegative, recorded completed samples.

Thread identity uses the existing conversation-thread mapping, preserving branches. No heuristic conversation reconstruction. Deleted or inaccessible relations have no invented name. Direct child details do not change the root-task denominator.

## Resource bounds

- SQL list: 1–100 records/page; Assistant overview: 1–25 rows/page.
- Initial overview contains compact Assistant identities/avatars, exact aggregate intervals and counts, with no execution-detail array or usage ledger. Up to 50 most recent known failure points per visible Assistant are retained; `failureMarkersTruncated` reports that marker limit without changing failure totals.
- Expanding an Assistant requests a scoped page of 25 conversation summaries. The host groups all matched compact facts by persisted conversation ID before pagination, so one conversation is never split across summary pages. Unlinked records group by persisted thread ID, or by execution ID when neither exists. Expanding a conversation loads at most 50 execution records per page, grouped by thread for display. Page controls replace rather than accumulate rows, and at most three expansion reads run at once. Current mounted pages are cached in memory; changing filters/snapshot invalidates them. Folding an Assistant retains its summary page but may unmount its conversation detail cache.
- Period summary/usage is queried only when its dialog opens. Tools retain their existing complete summary/usage contracts. Workspace options and execution details also remain on demand.
- Scalar summary: at most 20,000 facts; larger requests must narrow their filters (no sampling).
- Exact chart: at most 2,000 global segments and 4,000 visible Assistant segments; denser requests must narrow their filters, preserving gaps.
- Workspace picker: 50/page; direct children: 20/page; anomaly candidates: 1–100.
- Tools omit dense interval arrays from summaries/comparisons while retaining exact scalar counts and peaks.

## Usage

Only `ModelUsage` ledger entries whose `originExecutionId` directly matches selected executions are included; descendant usage is not rolled up speculatively. `recordedAt <= asOf` and the same tenant/organization apply. Tokens are null without coverage; pricing sums require explicit priced/free status, currency and amount. Missing pricing is counted and not converted to zero. Currency groups remain separate. Usage coverage is reported as executions with linked ledger entries.

## Tools

- `execution_query`: bounded filtered page, stable IDs.
- `execution_summary`: statuses, overlap peak, elapsed quantiles, sample counts and direct ledger usage.
- `execution_get`: one authorized record and direct-child page; no raw prompts, outputs, credentials or error bodies.
- `execution_compare`: two explicit windows, sample counts and matching records per window hour; not arrival rate, causal analysis or resource capacity.
- `execution_find_anomalies`: failed, long-running lifecycle age, or slow-completed reported elapsed candidates with bounded evidence IDs.

## Public navigation

The View uses `workbench.navigation.open` with the host-issued View key. Scalar parameters contain the complete query, `viewMode`, `expanded` Assistant IDs, `expandedConversations` group keys, `timeScale` and `following`; `selectionId` is the selected execution UUID. All relevant `init` messages restore state; identical query echoes do not reload data. UI-only zoom/expansion changes do not reload the overview; newly expanded rows request their bounded summary/detail page. Zoom changes canvas pixel density, not the query range. Scroll offsets remain local to the mounted View; navigation restores zoom and expansion, not the pan offset. No router internals, browser storage, tokens, tenant IDs or sensitive evidence are stored in navigation. For the current Assistant, opening an original execution sends conversation/thread/execution handles and `preserveView: true` for host reauthorization. Cross-Assistant records remain inspectable in the detail dialog, but conversation navigation is unavailable here: execution-observation authority does not grant access to unrelated conversation content.

## Compact timeline interaction

Assistant rows are 60 px. Conversations default to one 52 px aggregate row across all matching threads. Expanding a conversation reveals per-thread execution lanes: 52 px for one lane, growing by 44 px per additional overlap. Records are sorted by start time before half-open lane packing. Parent execution IDs and invocation kinds label root/sub-agent/delegated executions. A thread is marked as a branch only when persisted `parentThreadId` or `forkedFromMessageId` exists; overlapping execution intervals never imply a fork. Avatars project existing static URL/emoji fields; server-side Emoji Mart lookup resolves stored IDs without sending the emoji dataset to the browser. Missing or failed images use an initials fallback. No new table is introduced.

Mouse drags pan both scroll axes after a 5 px movement threshold and suppress the ensuing task click. The time ruler retains its separate range selection. Touch/trackpad scrolling, visible scrollbars and keyboard focus/scrolling remain available. The chart uses a small SVG step path instead of loading a charting runtime.

Horizontal density supports fit, 2×, 4×, 8×, 16×, 32× and 64×. The viewed center timestamp stays anchored during zoom; the left identity column stays sticky. The visible window controls tick and task-bar rendering, keeping high zoom bounded. Long execution labels remain visible when their start is outside the viewport. Conversation summaries use the selected counting unit and show overlap of record lifecycles, not proven simultaneous resource use. Missing phase/end evidence is not synthesized.

The overall overlap trend stays visible in the timeline's sticky header, with its title and peak beside the chart. Chart, time ruler and task rows share one canvas, viewport width, horizontal scroll offset and wheel/drag handlers. A hover crosshair displays the timestamp and recorded overlap count; half-open interval boundaries and idle gaps use the same counting semantics as the summary. Focus and Left/Right/Home/End keys also inspect the chart. Viewport changes clear stale hover coordinates. The chart reuses the overview payload without another query. Lifecycle limitations, unknown-end counts and the full date range remain in the information popover beside status totals. The popover supports click/Enter, Escape and focus return without changing timeline geometry, and does not duplicate the chart. Multi-day ranges include dates in accessible labels and tooltips. View and middleware metadata share a static inline SVG, so embedded hosts and the legacy Provider image endpoint do not depend on an icon font.

Mouse wheel zoom: vertical wheel input over the time plot zooms in (up) or out (down), anchored at the pointer timestamp. Line/page wheel deltas are normalized, small trackpad deltas accumulate, and scale changes are limited to one per 120 ms. Left identity-column scrolling, horizontal gestures and Shift-wheel remain native. Zoom is bounded by fit–64× and updates the existing public navigation state without changing query time bounds.
