# Project tasks remote view

Generic React project management UI, built with the workspace shadcn/ui components,
Tailwind CSS and Lucide icons. The same bundle serves the project page and an
Assistant's Workbench. It has no application-specific imports or Bid rules.

## Mounting

- Provider: `platform.project-tasks`; view: `timeline`.
- Project host slot: `task.management`.
- Assistant host slot: `agent.workbench.fixed`, feature: `project.tasks`, open mode:
  `on-demand`. A project must be present in the host runtime scope.
- Full view key: `platform.project-tasks__timeline`.
- Host chrome supplies project context. The view starts with its four tabs;
  refresh and last-sync tooltip share that row instead of adding a header.

The iframe derives its HTML root size from the host’s `densityRootFontSize` theme
token (`--xui-density-root-font-size`), falling back to 14px when absent. It does
not override the host token or choose a font size based on host type. Text sizes use Tailwind's default rem scale. Task
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

The view polls every five seconds while visible. Cursor comparison avoids replacing
unchanged data. Large tables and Gantt rows are virtualized. The shared Dialog
preserves the plan draft across viewport changes.

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

See `design-qa.md` for visual and interaction verification. Build outputs `app.js`
and `app.css` are generated; edit their source files instead.

Task details open in one centered, responsive Dialog for every view and viewport
size. The overview, execution history, outputs and existing actions are preserved.
The content scrolls inside the Dialog; close, Escape and backdrop actions use the
existing unsaved-plan confirmation. Closing restores focus to the opening control.

### Delivered files tab

The Outputs tab reads committed `result.artifacts` and `result.export` from the existing authorized `task-detail` response. It lists files by execution, exposes safe export diagnostics, and distinguishes no requested delivery from no delivered files. Working-directory paths and result declarations are not presented as downloadable artifacts. The execution viewer remains the existing download entry. Execution status, reliable-message receipts and acceptance controls belong to History and are not duplicated in Outputs.
