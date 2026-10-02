# Resource cards from tools

Browser views import result schemas and types from `@xpert-ai/plugin-sdk/agent-results`.
This public entry only exports portable result contracts and Zod validation; the SDK root also exports server dependencies.
Do not reach into another package's `src` directory or import the server SDK root from a browser bundle.

`emitResourceCard(card, runnableConfig)` emits the existing ChatKit `resource_card` contract. It does not create an Artifact or grant access to one. Emit after the referenced business object has been committed.

```ts
await emitResourceCard(
  {
    resource: { namespace: 'my-plugin', type: 'report', id: report.id },
    title: report.title,
    open: { target: 'workbench.view', viewKey: 'my-plugin__reports', selectionId: report.id }
  },
  config
)
```

Use stable namespace/type/id values. Repeated observations update the same card in the current reply. The host supplies `messageId` and `executionId`, persists the card, and excludes it from model/transcript text. Callers cannot choose another reply. The registered View must recheck authorization on every read and file download. Do not put credentials, arbitrary URLs, commands, or private paths in navigation parameters.

Task results use the provider-neutral `AgentResultItem` union: analysis, changes, tests, and explicitly declared file deliverables. File delivery defaults to `none`; `files` exports only the declared files and `archive` packages only an explicit selection. Export failure is recorded separately from task execution. A card for an exported artifact refers to the committed artifact and opens the authorized task results View.

New artifact references must include the committed `versionId`. The task-results View will not download older references without a pinned version: falling back to the current artifact version could deliver unrelated later content. Such task results remain readable.

Middleware using the host task-results View declares `AGENT_TASK_RESULTS_FEATURE` in `meta.features`. The View uses `AGENT_WORKBENCH_SLOT`, opens on demand, and declares support for selection and parameter queries. Other plugins should register their own governed View and feature; emitting a card alone does not activate a View.

Local rollout requires the matching ChatKit types/UI with resource-card support, then host contracts/SDK/server, then consuming plugins. Building a local SDK does not publish a new registry package.

`api:build` builds the task-results browser bundle before copying its assets. For a source-run API, first run `corepack pnpm nx run api:build-agent-results`. Generated `app.js` and `app.css` are ignored; commit the source and build configuration only.
