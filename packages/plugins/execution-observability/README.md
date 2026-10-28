# Execution observability / 执行总览

Built-in administrator-only plugin: Assistant aggregate intervals, expandable conversation/thread lanes, task details, a paginated list and read-only Assistant analytics. The shipped View uses shared **shadcn/ui + Tailwind v4** and Lucide icons; no private CSS classes. Preview assets and production assets are identical.

## Use

1. Build the platform and this system plugin (`corepack pnpm nx build execution-observability`). Default API bootstrap includes `@xpert-ai/plugin-execution-observability`.
2. Install the **Execution administrator / 执行管理助手** template from this plugin, configure its model, and publish it. Its analysis middleware is required so new ChatKit conversations retain the five tools without manual plugin selection. Alternatively connect the **Execution observability** middleware directly to an administrator Assistant's primary Agent and publish.
3. As an active organization administrator, open that Assistant's Workbench menu → **Execution overview / 执行总览**. The View is gated by the connected middleware feature. A template or Assistant name grants no permissions.
4. Choose a bounded range/workspace/status/source/record creator or Assistant. Parent rows always retain aggregate intervals; expand to reveal conversation/thread lanes. Click a bar to inspect details; drag the time ruler to narrow the range. The dialog can open a conversation belonging to the current Assistant through host reauthorization. Other Assistants show an explicit access-boundary hint; organization-wide execution visibility does not grant conversation-content access.
5. **Analyze period** asks the current Assistant to use the five read-only tools with the same filters and interval boundary. It does not send messages outside the application.

## App marketplace

The plugin contributes **Execution overview / 执行总览** as an organization-scoped App, linked to the existing `execution-administrator` template. Explore → Apps shows its localized presentation and packaged cover. App initialization asks for a primary model, creates a dedicated private workspace in the current organization, installs the template with its required analysis middleware, and publishes the Assistant. No knowledge base or external connection is needed. Existing manually created Assistants continue to work; adding App metadata does not initialize or migrate them.

`src/app-config.ts` is the single source of App configuration. The portable `.xpertai-plugin/plugin.json` declares the local cover so the host can safely resolve it. Both the manifest and `assets/branding/cover-v1.png` are included in build and npm package assets. The cover is an illustrative graphic, not a screenshot of production records; see [cover-generation.md](docs/cover-generation.md) for provenance.

## Data and access

No new tables, migrations, collectors, timers on the server, or credentials. Reads existing execution, conversation-thread, Assistant/workspace and membership usage ledger records. Every operation checks the current persisted administrator role, tenant, organization and active organization membership. Native ChatKit USER_XPERT sessions are accepted only for the same host Assistant and authenticated human; their persisted expiry, original Assistant grant, role and membership are rechecked on each operation. Public, enterprise, conversation and API-key credentials are rejected. Query schemas reject tenant/organization scope overrides; only the host binds scope. View, tools, detail links and usage all share these checks.

See [data-contract.md](docs/data-contract.md) for exact semantics and limits. Historical phase occupancy is unavailable in existing records: lifecycle overlap **must not be described as measured active concurrency**. Missing ends/costs remain unknown. The runtime never infers human approval or queuing from `interrupted`/`pending`.

## Development

Use the repository-declared Node/Corepack versions and local startup instructions. Build `contracts` and `plugin-sdk` before the plugin. The shared preview uses **synthetic** data:

```sh
corepack pnpm nx run execution-observability:generate-remote-components
corepack pnpm remote-view:preview --config packages/plugins/execution-observability/remote-components/timeline/preview.config.mjs --port 4419
corepack pnpm nx run execution-observability:check-remote-components
corepack pnpm nx test execution-observability --runInBand
```

The preview does not establish platform authentication, plugin activation or model execution. Full API/Workbench acceptance is a separate verification step.

See [validation.md](docs/validation.md) for the test results, View acceptance evidence and real shared-DB integration evidence.
