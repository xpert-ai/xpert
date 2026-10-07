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

The iframe uses the shared `--xui-density-root-font-size` override: 14px in both the
Assistant Workbench and project pages. Text sizes use Tailwind's default rem scale. Task
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
retain separate runtime intervals and business outcomes. The Outputs tab shows
the available execution summaries; it does not invent artifact file links.

Board cards reuse the table/Gantt Assistant avatar, name and chronological execution
dots. Each dot opens its exact authorized execution; the card title opens task details.
These are separate buttons so opening an execution does not also select the card.

The view polls every five seconds while visible. Cursor comparison avoids replacing
unchanged data. Large tables and Gantt rows are virtualized. A shared draft survives
the responsive switch between the desktop inspector and the narrow-screen Sheet.

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

See `design-qa.md` for visual and interaction verification. Build outputs `app.js`
and `app.css` are generated; edit their source files instead.
