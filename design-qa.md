# Execution observability — design QA

Result: **passed** for the agreed preview **View acceptance** scope (2026-10-27). The subsequent authenticated shared-DB acceptance is recorded below and in the plugin validation report; preview screenshots remain explicitly synthetic evidence.

## References and scope

- Approved aggregate/expanded layout: `exec-9b3ef903-4c88-4d8d-9e80-67483fbfc1cf.png`.
- Approved conversation/overlap layout: `exec-395ae23d-5cc1-4c81-a15d-275bc080407c.png`.
- References live under `/Users/xpertai05/.codex/generated_images/01a17bb6-b815-7c22-b72d-44097448520b/`.
- The user requested their layout with shared shadcn/ui and Tailwind, not their bespoke colors/type scale. Host navigation is provided by Workbench, not duplicated inside the plugin.
- Production-generated `app.js` and `app.css` were rendered through the shared Remote View preview host. All browser data was synthetic and visibly labeled.
- Final desktop comparison viewport: 1491 × 1055; responsive checks: 390 × 844. Dark mode receives semantic host tokens, as the real renderer does.

## Visual comparison

Evidence directory: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-implementation/`.

Both `comparison-summary.png` and `comparison-trend.png` place the approved image and final implementation in one image. Both were visually inspected. The comparisons retain the Assistant identity column, time ruler, parent interval summaries, conversation lanes, execution bars and global overlap trend. The shared theme determines typography, borders, colors and button appearance.

Final evidence:

- `collapsed.png`: all Assistant summaries, idle gaps, overlap counts and failure markers.
- `expanded.png`: first Assistant expanded; its parent summary remains visible.
- `detail.png`: failed execution, exact ID, duration, source and missing-usage evidence.
- `dark-en.png`: English controls, dark semantic colors, status distinctions, unwrapped time labels.
- `mobile-list.png`, `mobile-detail.png`: narrow-screen controls, scrolling list and bounded dialog.
- `range-selection.png`: drag-to-narrow query result.
- `bridge-state.json`: synthetic request/command evidence for exact execution navigation and analysis.
- `iteration-1-expanded.png`: retained earlier iteration for comparison.

## Corrections made during QA

| Priority | Finding                                                 | Resolution                                              |
| -------- | ------------------------------------------------------- | ------------------------------------------------------- |
| P2       | A 45-minute custom window appeared as a one-hour preset | Custom ranges are identified correctly                  |
| P2       | Fractional minute tick labels were truncated            | Use bounded, readable time intervals                    |
| P2       | Similar UUID prefixes were indistinguishable            | Display prefix and suffix; preserve full IDs in details |
| P2       | Collapsed rows hid failure evidence                     | Add count and clickable known-end failure markers       |
| P2       | Synthetic provenance was not visible                    | Show an explicit preview-data badge                     |
| P2       | Dark outline-button defaults hid status backgrounds     | Apply semantic dark variants through Tailwind utilities |
| P2       | Unknown-end events appeared as blank slivers            | Show a question-mark point with title/accessible label  |
| P3       | English time ticks wrapped at the right boundary        | Keep tick labels on one line                            |
| P3       | Dialog close control used a default English label       | Localize the shared Dialog close button                 |

No unresolved P0/P1/P2 visual findings in the accepted preview scope.

## Interaction checks

Passed: collapse/expand, retained parent aggregation, task and failure-marker detail, aggregate-to-record drilldown, workspace filtering, search/empty state/recovery, list mode, range selection, dialog Escape, Chinese/English locale and light/dark themes. Analysis preserves the exact filters, time zone, counting unit and cutoff. Original-execution navigation includes conversation, thread and execution IDs and `preserveView: true`. Fixture commands are intercepted locally; no real model or external message was sent.

The light preview reported no console warnings/errors. One initial dark-tab `MutationObserver.observe` error appeared without a source URL; it did not recur across subsequent reloads and did not prevent rendering or interaction. Its origin was not established, so this report does not claim all-browser console cleanliness.

## Deliberate data differences and deferred checks

Existing records cannot reconstruct historical queue/human-wait phases or true resource concurrency. The chart is therefore labeled **recorded interval overlap**, `pending`/`interrupted` retain their stored meanings, and unknown ends are point markers. The failure total counts matching failed records, not necessarily failure transitions within the chosen window. Missing costs remain unknown, and currencies are kept separate.

The initial delivery deferred authenticated integration. On continuation, the user logged into Cloud 4300, API 3300 passed its normal schema checks, and 执行管理助手 was installed and published through the normal UI. Authenticated mounting, real data aggregation, expansion and failed-record dialogs now pass. Real-account role isolation beyond the signed-in administrator is covered by automated access/SQL tests, not a second-user UI session. See the plugin validation report for final model and browser-restoration evidence.

## Authenticated View acceptance

Evidence directory: `/Users/xpertai05/tiwen/outputs/xpert-execution-observability-real-acceptance/`. The real host uses its native shadcn theme and displays no synthetic badge. `real-collapsed.png` and `real-expanded.png` initially show the fixed 24-hour range; `real-detail.png` shows a persisted failed execution.

Integration corrections include native USER_XPERT session authorization, production ledger varchar/UUID parameter separation, title display and a required analysis middleware. Cross-Assistant conversation navigation is intentionally unavailable from this detail dialog and explains the original-Assistant access boundary; execution metadata remains visible to the authorized organization administrator.

Authenticated browser Back/Forward and full refresh preserve the queried time window, list/timeline mode, paused state and expanded rows. The final resumed Assistant run completed successfully in 80.887 s after routing its configured model endpoint through the existing system proxy. `real-analysis-complete.png` shows all three real tool calls and the final Chinese analysis; persisted success and returned records are saved in `analysis-verification.json`. Earlier failed network trials remain recorded and are not presented as successful runs.

Real parallel-conversation check passed: two simultaneous requests completed successfully (35.255 s / 52.035 s reported elapsed), with 34.874 s recorded interval overlap. `real-concurrent-collapsed.png` shows the retained summary segment labeled 2; `real-concurrent-expanded.png` shows the two independent conversation lanes. All data is from real Assistant executions.

### Follow-up: compact execution overview (2026-10-27)

Validated the production View in the signed-in 4300 platform with real records: 60 px Assistant rows and 52 px single-lane conversation rows, existing avatars, smaller toolbar/chart and readable week ticks. Both-axis drag scrolling preserves ordinary task clicks, native scrolling and independent ruler selection. Corrected the right-edge overlay-scrollbar hit area found during real acceptance. Initial data excludes hidden conversations and ledger usage; expansion pages are bounded to 50 and request concurrency to 3. Large fixture pagination/cache and dark/narrow layouts pass; real summary/detail dialogs load correctly. Bundle reduced 30.3%, no schema added. Full evidence and limitations are recorded in plugin `docs/validation.md`; screenshots in `outputs/xpert-execution-observability-compact/`.

## Horizontal zoom and conversation summaries — 2026-10-28

The signed-in real View now supports fit through 64× pixel-density zoom with anchored horizontal panning and sticky Assistant/conversation labels. Conversations default to a 52 px aggregate row; expanding them exposes separate threads, explicit root/sub-agent labels and persisted fork origins. The reported red/green pair was verified as a failed parent and successful child in the same thread, not a fork. Real detail navigation, bounded visible ticks and lazy 25-conversation paging were checked. A separate synthetic fixture covers an actual thread fork and 612 records. Full validation limits, including unrelated contracts strict-null diagnostics, are recorded in the plugin validation report. Evidence: `outputs/xpert-execution-observability-zoom/`.
