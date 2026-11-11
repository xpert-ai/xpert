# Project tasks remote view

Generic React project management UI, built with the workspace shadcn/ui components,
Tailwind CSS and Lucide icons. The same bundle serves the project page and an
Assistant's Workbench. It has no application-specific imports or Bid rules.

## Mounting

- Provider: `platform.project-tasks`; view: `timeline`.
- Project host slot: `task.management`.
- Assistant host slot: `agent.workbench`, feature: `project.tasks`, open mode:
  `on-demand`. A project must be present in the host runtime scope.
- Full view key: `platform.project-tasks__timeline`.
- Host chrome supplies project context. The view starts with its four tabs;
  refresh and last-sync tooltip share that row instead of adding a header.

The iframe uses the shared shadcn stylesheet and host theme adapter, including
the host’s `densityRootFontSize` token (`--xui-density-root-font-size`) in compact
mode. It does not override the shared typography defaults. Text sizes use Tailwind's default rem scale. Task
rows are 40px, with shared geometry constants for virtual scrolling and Gantt
dependency paths. Toolbars and detail panels use compact spacing.

## Data and actions

The parent host supplies the locale, theme and instance-scoped remote-component
bridge. `requestData` returns `ProjectTaskGraph`; `change` updates a task plan with
its expected revision. `execution-target` resolves an authorized, specific task
execution before the UI invokes `workbench.navigation.open`.

`canEditPlan` controls whether the form is editable. The server remains the
authority for membership, tenant/organization scope, revision conflicts and DAG
validation. Provider-owned hierarchy and dependencies cannot be changed in this
generic view. Editing a schedule does not start an Agent or retry a task.

All tasks, Task tree, Gantt and Status board share search and filters. The UI reads
explicit task kinds and ownership fields; it never derives business stages from
titles or source keys. Missing dates are shown as unscheduled. Separate attempts
retain separate runtime intervals and business outcomes. The Outputs tab lists
committed artifacts and delivery diagnostics, with downloads in the execution viewer.

Execution history distinguishes evidence-only reviews from execution reviews. Evidence-only
reports contain textual findings; execution reports show a summary, performed checks,
commands, expected/actual results, evidence paths, and findings with their blocking flag
and reproduction steps. Paths and commands are displayed as text, not executed or opened.
The host requires the report version to match the requested review mode and retains the
pinned implementation, specification and evidence checks. Runtime success remains separate
from the acceptance verdict and the parent's completion decision.

The execution limit and deadline come from the authorized invocation's existing runner
receipt. Historical receipts without a budget show no invented default. Reviewer mode and
rework finding IDs describe the recorded execution purpose; they do not assert that a
review task has already been scheduled. No additional task graph fields or Computer API
dependency is introduced for this detail view.

`node --test tools/testing/project-task-review.e2e.mjs` covers both report modes, negative
verdicts with a successful runtime, receipt limits, localized details and a narrow viewport
using local fixtures. It does not establish live Agent or installed-plugin acceptance.

Board cards reuse the table/Gantt Assistant avatar, name and chronological execution
dots. Each dot opens its exact authorized execution; the card title opens task details.
These are separate buttons so opening an execution does not also select the card.

The view polls every five seconds while visible. Cursor comparison avoids replacing
unchanged data. Large tables and Gantt rows are virtualized. The shared Dialog
preserves the plan draft across viewport changes.

Execution summaries identify implementation, independent review and feedback rework
from the execution's declared purpose. A validated review verdict is shown separately
from successful runtime completion; a completed negative review keeps the runtime's
success color and shows "Changes required" or "Indeterminate". Failed or unfinished
executions never display a stale review verdict. Older records without a purpose retain
their existing labels. Task status and task-node fields are unchanged.

Read and action errors appear as bottom-right notifications with localized close and
refresh actions, without shifting the task view. Notifications close after six seconds
or manual dismissal; the same continuing error does not reopen on every poll. A new
error, or recurrence after a successful refresh, can notify again. Each mounted view has
its own notification scope; recovery and unmount dismiss only that view's notification.

Tasks may supply a nullable `progress` percentage (0–100). List, tree, Gantt, board
and detail views display a circular indicator with the task status. Unknown progress
retains the status icon; the view never estimates completion from elapsed time or
changes status when a percentage reaches 100. Providers own the measurement and
can clear it with null; omitting it preserves a previously stored value.

## Development

Run from the repository root using the workspace's supported Node version:

```sh
node packages/server-ai/src/xpert-project/remote-components/project-tasks/build.mjs
node_modules/.bin/tsc --noEmit -p packages/server-ai/src/xpert-project/remote-components/project-tasks/tsconfig.json
node tools/remote-view-preview/cli.mjs --config packages/server-ai/src/xpert-project/remote-components/project-tasks/preview.config.mjs --port 4324
```

The preview serves the production bundle with an in-memory generic knowledge
project, not a second implementation. It supports `TASKS_PREVIEW_THEME=dark`,
`TASKS_PREVIEW_LOCALE=en-US`, `TASKS_PREVIEW_HOST=project` (default: `agent`) and
`TASKS_PREVIEW_SCENARIO=empty|readonly`. Restart
the preview after rebuilding assets. Fixture changes are reset on restart.

Build outputs `app.js`
and `app.css` are generated; edit their source files instead.

Task details open in one centered, responsive Dialog for every view and viewport
size. The overview, execution history, outputs and existing actions are preserved.
The content scrolls inside the Dialog; close, Escape and backdrop actions use the
existing unsaved-plan confirmation. Closing restores focus to the opening control.

### Component styling

Use the current workspace's `@xpert-ai/shadcn-ui` Radix components directly.
Dialogs compose `DialogHeader`, `DialogTitle`, `DialogDescription` and, when
needed, `DialogFooter`; retain the default close control, padding, typography,
border, radius and shadow. Dialogs size to content with only responsive maximum
width/height and scrolling constraints. Do not add a parallel dialog frame.

Use component variants for Tabs, Buttons and Badges, and shared Checkbox,
Textarea and Accordion primitives for form fields and disclosure. Color, radius,
font and density differences come from the existing host-to-shadcn theme variables
(`--background`, `--foreground`, `--muted`, `--border`, `--ring`, `--radius`, etc.),
not View-specific component skins or active-state overrides. Canvas geometry,
virtualized rows, business status indicators and overflow remain View layout concerns.

After building the assets, verify light, dark and narrow layouts, theme variables,
dialog focus, scrolling and configuration controls with:

```bash
node --test tools/testing/project-tasks-shadcn.e2e.mjs
```

Screenshots default to the OS temporary directory under `project-tasks-shadcn`;
set `PROJECT_TASKS_E2E_OUTPUT` to use another directory. The test uses the in-memory
preview fixture and does not change a live project's configuration.

### Delivered files tab

The Outputs tab reads committed `result.artifacts` and `result.export` from the existing authorized `task-detail` response. It lists files by execution, exposes safe export diagnostics, and distinguishes no requested delivery from no delivered files. Working-directory paths and result declarations are not presented as downloadable artifacts. The execution viewer remains the existing download entry. Execution status, reliable-message receipts and acceptance controls belong to History and are not duplicated in Outputs.

### Navigation and timeline controls

The host entry is named **Project tasks**. View tabs stay within one fixed-height
row; narrow panels show labelled icons. The toolbar keeps search and filters
visible and moves grouping, sorting, fields and secondary timeline actions into
**More actions** as the available panel width decreases. It does not scroll horizontally.

Drag list, tree or Gantt content with the primary mouse button to pan both axes.
A short click still opens the task or execution; column resize handles retain their
own drag behavior. Touch scrolling and keyboard controls remain native.

Gantt offers separate hour/day/week granularity and zoom controls. Zoom changes
the horizontal time scale while preserving the time at the viewport center when
scroll bounds allow. **Fit all** resets the zoom and **Go to now** locates the current
time. Zoom and pan only change presentation; they never reschedule or start tasks.

### Refresh recovery and layout regression

The remote view sends `saveViewState` with a small scalar `state` object. The Cloud
renderer validates and stores it in tab-session storage, scoped to host, view,
user and runtime context, and returns it as `viewState` during `init`. The remote
bundle does not access browser storage. Explicit initial query destinations take
precedence. Configuration dialogs and business actions are never restored.
Project tasks remembers the selected view, pipeline instance, round, display mode,
lane filter/highlight, blocked filter and stage viewport. This is per browser tab,
not server-side or cross-device persistence.

Use `TASKS_PREVIEW_SCENARIO=pipeline-layout` with the preview command above for an
eight-assistant lane and long configured conditions; select the Pipeline tab.
Assistant lists scroll inside their role region. Long/bypass conditions reserve
separate tracks above cards; unrelated rows retain their compact height.
