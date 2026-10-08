# Project tasks implementation QA

## Task detail Dialog and host typography — 2026-10-07

- Replaced both the desktop inspector and narrow Sheet with the shared Dialog.
  Existing detail tabs, execution data and plan editing stay in the same component.
- Removed the bridge's hard-coded root font override. The HTML root now follows
  the host's `densityRootFontSize` token, falling back to 14px when absent.
- Browser preview verified centered layout, narrow 560px viewport, execution and
  overview tabs, a 95-minute draft surviving resize, Escape/close confirmation,
  keeping or discarding that draft, and focus returning to the originating task.
- Computed root font was 14px without a host token and 18px with an 18px host
  token. No browser error or warning was reported during these preview checks.
- Production remote bundle build passed. The strict view TypeScript check still
  reports errors in shared contracts, with no diagnostics in this remote view.
- Synced the rebuilt assets into the running local API's build output. Its
  authorized remote-component entry returned HTTP 200 with `Cache-Control:
no-store`, and both JavaScript and CSS matched the rebuilt source assets.
- This verification used fixture data; it did not start an Agent or change a real
  project task. Working-directory behavior is unchanged.

Date: 2026-09-29

final result: passed

## Scope and visual reference

Implemented the selected Project Tasks mockup in the production remote component,
using workspace shadcn/ui and Tailwind. The subsequent user instruction removes
both project-name/update and page-title/subtitle header rows. Tabs now start at the
top; refresh remains on their right and its tooltip contains the last update time.
The project context remains available to assistive technology in the main label.

Reference image:
`/Users/lilinhao/.codex/generated_images/01a0d3b7-6eeb-7080-b02c-dd7787de1494/exec-5ed917fa-fac8-4ac8-80f2-862668444f1b.png`

Evidence directory: `/Users/lilinhao/tiwen/xpert/output/project-tasks/`.

- `gantt-final.png`: 1600 × 1000 desktop preview, selected in-progress task,
  independent attempts in the inspector, both top headers removed.
- `dark-final.png`: 860 × 900 dark host with the same production bundle.
- `draft-preserved.png`: inspector after resizing from narrow Sheet to desktop;
  the unsaved 95-minute duration remains visible.
- `empty-final.png`: empty project with no invented tasks or schedule.
- `execution-navigation.png`: installed Assistant Workbench after opening the
  selected fourth execution and its external Assistant transcript.

The reference (1586 × 991) and desktop implementation (1600 × 1000) were opened
together in a single comparison input. Both show Gantt plus execution details.
Compare the app-owned region: navigation rails and outer Workbench tabs belong to
the host. Preview content uses a generic knowledge project to verify reuse beyond
Bid. A draft capture is 1454 × 909 due to the browser's zoom/device normalization;
it is functional evidence, not the primary geometry comparison.

## Visual checks and iterations

- Four compact view tabs, aligned search/filter toolbar, task tree beside timeline,
  persistent selected row, execution inspector, and plan/actual/forecast legend.
- Lucide icons, shared semantic colors, borders and focus/hover states; the host's
  palette and density remain authoritative. Task names are 14px, with smaller
  metadata. All copy is provided in Chinese and English.
- Fixed the initially undersized text caused by root-relative compact tokens.
- Fixed the current-time label wrapping vertically.
- Fixed the dark preview host's incomplete light/dark tokens and recaptured.
- Restored tabpanel semantics and preserved draft state across the Sheet breakpoint.
- Removed the two header rows according to the user's final screenshot feedback;
  rebuilt and verified the same result in the real Assistant Workbench.

No outstanding P0/P1/P2 visual or interaction findings in this scope.

## Functional verification

- All tasks, hierarchy, Gantt and board modes switch successfully. Search and status
  filtering preserve matching descendants and their ancestor context.
- Grouping by assistant, field selection, collapse/expand, hour/day/week scale and
  current-time controls use the shared task graph.
- Edited a fixture task from 60 to 90 minutes, previewed downstream impact, saved
  revision 2, and verified the persisted fixture value after reloading data.
- Narrow-screen details open/close and the underlying tabs remain interactive.
  A 95-minute unsaved draft survived resize to desktop; closing prompted for
  discard, and discard did not mutate the fixture.
- Fixture navigation for an earlier attempt preserves that attempt's conversation,
  thread and execution identifiers rather than selecting the latest attempt.
- Actual project host and on-demand Assistant Workbench loaded all 18 tasks. The
  selected repair task exposed four independent attempts. Opening attempt 4
  navigated to thread `ef6069cf-28de-4a10-a3dd-0112e7b37d8e` and opened the matching
  completed external Assistant execution, including its historical tools/output.
- On-demand manifest, data and remote-component entry returned HTTP 200. Local
  preview browser error log was empty. No LLM generation was started for QA.

## Code verification

- Production bundle build and remote UI TypeScript check passed after header removal.
- Full `packages/server-ai/tsconfig.lib.json` TypeScript check passed.
- Four focused suites passed, 19 unique tests: generic hierarchy/filtering and
  schedule bounds; graph validation; execution-target authorization; project/assistant
  labels scoped by tenant and organization; editor/viewer/archive capabilities.
- `git diff --check` passed. Maintained source files are below 1000 lines.
- No Bid-specific imports, status inference, task-title matching, or application
  business rules exist in the view implementation.

## Explicit scope boundaries

The four built-in tabs are complete; user-defined saved views and additional tabs
are not part of this delivery. The Outputs tab displays execution summaries from
the current generic contract; artifact file browsing is not fabricated. Planning
changes do not start or retry Agents. Provider-owned relationships and server
authorization/revision checks remain in force.

## Compact-density follow-up

The user requested a 14px HTML root and a more compact overall view. Fixed the
shared compact selector's 15px fallback by setting its documented
`--xui-density-root-font-size` override to 14px in this view. Confirmed that the
installed Workbench iframe entry includes the override. Reduced rows from 52px
to 40px and header rows to 36px; virtual offsets and Gantt dependency centers use
the same constants. Reduced toolbar/control spacing, inspector heading and
execution-card padding. `compact-14px.png` records the updated desktop result;
the row grid, bars and dependency endpoints align. Build and UI typecheck passed.
Tree collapse/expand, board switching and the execution inspector passed browser
checks. Browser logs during this follow-up reported a `MutationObserver.observe`
Node-type error during page load; its origin is not established and no impact on
these interactions was observed. The follow-up does not claim an error-free console.

The subsequent platform-view request changes the HTML root to 12px. Updated both
the shared compact-density override and the HTML rule, rebuilt the bundle, and
reloaded the installed project view. Explicit table typography remains unchanged;
root-relative control dimensions and spacing now follow the 12px root.

Final clarification scopes 12px to the Project host only; Assistant Workbench
returns to 14px. The bridge now reads the existing `init.manifest.hostType` field
and sets the compact root variable accordingly, with 14px as the default. No URL
or application-name inference is used. Build and UI typecheck passed. Automatic
browser reload was blocked by the browser URL security policy, so visual
confirmation of this final host-specific adjustment remains pending a manual reload.

## Unified toolbar, column resizing and execution shortcuts

Follow-up on 2026-09-29:

- Merged Gantt time controls into the search/filter toolbar. On narrow hosts the
  single row scrolls horizontally; search keeps its focus when no tasks match.
- Table, tree and Gantt share column widths for this view session. Header dividers
  support pointer dragging, arrow keys (Shift for larger steps), and double-click
  or Home to reset. Headers, task rows and timeline offsets use the same widths.
  Columns unpin when necessary so a narrow host can still scroll to the timeline.
- The platform resolves Assistant avatars alongside their names, within the same
  tenant/organization query, using the existing Emoji Mart ID serializer. Image
  failures and absent avatars fall back to a generic Assistant icon.
- Assistant cells show chronological execution dots with runtime/outcome details.
  They and the inspector share exact-attempt authorization and Workbench navigation.
  Unlinked records explain why a conversation cannot be opened.

Validation: production bundle built; 15 targeted Jest tests passed. Browser
preview checks covered pointer and keyboard resizing, width preservation across
views, zero-result search focus, avatars, and both execution dot clicks. Actual
Workbench navigation was not rerun against the installed host in this follow-up;
its existing command is reused and its exact target is covered by unit tests.
The strict view typecheck currently reports 43 errors in other shared contracts
files and none in the task view or its graph contract. No unrelated type errors
were changed.

Evidence: `output/project-tasks/toolbar-columns-executions-20260929.png`.

## Coordinator ownership, actual avatars and single footer

Follow-up on 2026-09-29:

- Bid's provider now projects the run's persisted `requestScope.assistantId` as
  the root task's assignee. Different runs retain their own coordinator; child
  executors stay independent. Historical runs without that identity are not
  assigned to an inferred or currently viewing Assistant. This stays in the Bid
  provider; the generic view contains no application-specific ownership logic.
- The previously running API omitted `assigneeAvatar` entirely. After the local
  API reloaded, the real graph for project
  `5e9abd82-0171-4acd-b237-8af3abfc4a6c` returned “Bid Studio 助手” for the root,
  and the configured `memo` emoji plus background for both assigned Assistants.
  Browser inspection confirmed both render the actual round avatars.
- Moved the Gantt legend into the shared task-count footer. Counts, five legend
  keys and completed count occupy one row, with horizontal scrolling available
  when space is constrained. Other views retain the same compact count footer.

Validation: 7 Bid task-provider tests and 8 platform graph/presentation tests
passed; the production view bundle built. The installed project host displayed
the same 8 tasks, correct root assignee, two configured avatars and one footer.
The existing execution dot was clicked, but an execution dialog did not become
visible in this browser check; this follow-up does not claim execution navigation
was verified. No generation or task retry was started.

The full Bid package build exposed the existing contracts version mismatch
(`AGENT_WORKBENCH_SLOT` / `openMode`). Testing with local contracts additionally
exposed an unrelated image-understanding type mismatch. Temporary dependency/type
adjustments used to investigate the build were restored; no SDK version, lockfile
or image-understanding source changes are included in this follow-up.

Evidence: `output/project-tasks/assignees-single-footer-20260929.png`.
