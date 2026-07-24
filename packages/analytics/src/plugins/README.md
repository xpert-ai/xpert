# Data X Agentic Apps

The analytics package exposes the governed analytics workflow as independent Agentic Apps. Each app has:

- an `AgentMiddlewareStrategy` for ChatKit automation;
- an `IXpertViewExtensionProvider` for manual Workbench operation;
- the same Nest service boundary for both interaction modes;
- feature-gated Workbench manifests and `assistant.tool.completed` refresh events.

## Apps

| App               | Middleware provider       | Workbench view                      | Responsibility                                                                                                              |
| ----------------- | ------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Semantic Modeling | `datax_semantic_modeling` | `datax_semantic_modeling__modeling` | Create model workspaces, inspect source tables, edit dimensions/cubes/measures, preview, validate, save drafts, and publish |
| Metric Management | `datax_metric_management` | `datax_metric_management__metrics`  | Scope, create, edit, review, certify, publish, import/export, and delete governed metrics                                   |
| Query Analysis    | `datax_query_analysis`    | `datax_query_analysis__query`       | Resolve models/cubes, execute MDX, and inspect the real normalized columns and rows                                         |
| Live Artifacts    | `datax_live_artifacts`    | Dynamic live artifact views         | Turn analysis output into persistent dashboard-like HTML artifacts                                                          |

## Conversational workflow

Install the four middleware providers on the same assistant in this order:

1. `datax_semantic_modeling`
2. `datax_metric_management`
3. `datax_query_analysis`
4. `datax_live_artifacts`

The assistant can then complete the governed loop:

1. Call `semantic_model_list_workspaces`, or create a workspace with
   `semantic_model_create_workspace`.
2. Select it with `switch_model_workspace`.
3. Discover physical tables with `list_tables` and `list_table_schema`.
4. Model dimensions, hierarchies, cubes, measures, calculations, and virtual cubes with the focused semantic tools.
5. Validate data access with `preview_cube`.
6. Save or publish the model.
7. Scope and manage governed indicators through the metric management tools.
8. Resolve a model and cube with `datax_query_model_context`.
9. Run a complete MDX statement with `datax_query_execute`. The tool returns the actual
   `columns`, `rows`, row counts, generated MDX/SQL when available, and audit metadata.
10. Validate and persist dashboard-like output with `datax_validate_live_artifact` and
    `datax_create_live_artifact`.

Set `openWorkbench: true` on `datax_query_execute` when the result should also open in the
Query Analysis Remote View.

## Manual workflow

The same middleware features activate fixed Workbench menu entries:

- **Semantic Modeling** provides workspace and data source selection, physical table discovery,
  full schema editing, optimistic draft-version checks, validation issues, and publishing.
- **Metric Management** provides the governed metric table, filters, editing actions, approvals,
  import/export, and embedding controls.
- **Query Analysis** provides model/cube selection, an MDX editor, execution, and a scrollable
  table backed by the same query service used by ChatKit.

Remote components never receive server credentials. They communicate through the Workbench
bridge using `requestData`, `requestParameterOptions`, and `executeAction`.

## Development verification

```bash
corepack pnpm exec nx run analytics:check-remote-components
corepack pnpm exec nx build analytics
corepack pnpm exec jest --config packages/analytics/jest.config.ts --runInBand \
  packages/analytics/src/plugins/datax-semantic-modeling \
  packages/analytics/src/plugins/datax-query-analysis \
  packages/analytics/src/plugins/datax-metric-management
```

The generated Remote View bundles are checked into each app's `remote-components/<entry>/app.js`.
Edit the TypeScript/TSX sources and regenerate them with:

```bash
corepack pnpm exec nx run analytics:generate-remote-components
```
