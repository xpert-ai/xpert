# Conversation Agent Plugins

A standard Agent Plugin is a resource package containing a root-level `plugin.json`, `skills/<name>/SKILL.md`, and `mcp.json`. It does not require `package.json` and does not execute npm scripts, hooks, or server modules. Native Xpert plugins retain their existing installation mechanism and scope rules.

## Administrator workflow

1. Open **Plugins → Agent Plugins** in the organization scope. The administrator must have management permission for the target workspace.
2. Enter an HTTPS Git URL, an explicit ref, and an optional subdirectory, or upload a ZIP. The ZIP can contain the package contents directly or wrap them in a single top-level directory. The system retains the source, Git commit, content digest, and component diagnostics. A valid Skill is not discarded because another Skill or MCP configuration in the same package is invalid.
3. Review the component list. MCP servers declaring `xpertai.connectors` automatically use Connector authorization. Legacy personal OAuth packages must publish a new version with Connector configuration; personal authorization is no longer offered. Map logical expert references in `xpertai` to published experts available in the current organization. Middleware providers must already be installed through native plugins, and their configuration must conform to the provider schema.
4. Select the workspaces that may use the resources and publish the bindings. Existing middleware configurations or published digital experts can also be made available directly, without creating a plugin package.
5. To upgrade, import the new package first, then select **Replace version** in the publication form. Existing conversations continue using the old binding, while the refreshed catalog shows only the new version. Disabling the old binding blocks subsequent calls; users must remove it or select a replacement.

Packages are organization-scoped. Runtime checks cover the organization, workspace, project, Assistant, resource and expert permissions. Users can select published package bindings and automatically discovered resources described below, and use connections configured by workspace administrators. Assistant access governs runtime use; users do not own Connector accounts.

## Workspace editor additions in Desktop

Discover & add > Plugins uses a searchable workspace combobox containing only current-organization workspaces the actor can edit. It adds already imported organization packages without opening the administrator page. Required logical expert references must be mapped to accessible published experts before adding.

- `GET /api/agent-plugins/workspace-options`: editable workspace and authorized expert choices.
- `GET /api/agent-plugins/workspaces/:id`: safe display catalog and workspace publication status; no source paths, MCP configuration or credentials.
- `POST /api/agent-plugins/workspaces/:id/plugins`: `{ packageId, experts }`; returns `added` or `already_added` and `bindingId`.

Each read/write checks workspace edit permission and organization scope. Addition targets exactly one workspace, uses the existing resource installer, preserves other workspace bindings and existing published versions, and cannot re-enable a disabled binding. A package-family/workspace advisory lock serializes repeated additions. Git/ZIP import, replacement, disabling and shared connection administration retain their existing administrator checks. Connector dependencies may need a workspace administrator to configure them first. Adding a plugin does not select it in a conversation; users select available capabilities in ChatKit afterward.

### Desktop connection handoff

ChatKit sends the connection command directly to Desktop without another confirmation dialog. A non-blocking status strip allows cancellation while the browser handles authorization. Its host validates the Assistant, organization, workspace binding and configuration permission, then opens `/workspace-connection` with `autostart=1` and identities only. The browser host revalidates the same context and enters the existing target Connector flow automatically. OAuth continues in that browser tab to retain its callback-binding cookie; credential forms and embedded QR flows retain their existing behavior. Regular Cloud chat continues using its existing popup flow.

A Desktop attempt is bound to the current session generation, organization and binding, expires after ten minutes, and is superseded by a newer attempt. Desktop polls every 2.5 seconds with no overlapping requests; repeated commands for the same binding reuse the pending attempt. Only a fresh server response reporting a granted, active shared connection can finish the attempt and foreground the native app. Cancellation or a context change prevents a late completion; cancellation stops waiting without revoking provider access. No authorization codes or credentials are passed through a return URL. The message draft is preserved.

## Conversation behavior

### Automatic resource discovery

- External experts are discovered from published Agents accessible to the current actor. A delegated ChatKit session must first authorize its exact parent Assistant; resource discovery then applies the actor's tenant, organization, workspace and membership rules. The catalog shows the newest published revision per expert family and excludes the parent family and experts already configured in the graph.
- Middleware entries combine managed configuration presets with installed, user-addable providers whose default configuration passes their schema. Missing required configuration, malformed schemas, internal providers and deprecated providers are excluded from automatic discovery. Providers already represented by managed presets or the entry Agent's graph are not listed again.
- Explicit managed bindings take precedence in the catalog. Disabling a binding also prevents automatic discovery from making the same resource available again in that workspace.
- Automatic entries do not create database bindings or change Assistant graphs. Their scoped UUID and configuration digest use the existing SDK selection contract. Every execution rebuilds and authorizes the reference; expert republication or middleware configuration/provider-version changes invalidate stale references. Older published expert snapshots remain usable while they still exist and are authorized.
- Existing menu caching and pagination are unchanged. Reload the page after deploying the backend change to replace a previously cached catalog.

The host enables the **Plugins** entry below the composer with `composer.resources.enabled: true`; it is disabled by default in ChatKit. Plugins are selected as a whole, with components and diagnostics shown in their details. The UI supports search, categories, pagination, browsing all resources, adding and removing selections, and preserving drafts after authorization failures.

`runtimeResources` is independent of `runtimeCapabilities`:

```json
{ "revision": 0, "resources": [{ "bindingId": "<binding UUID>", "version": "<64-character configuration digest>" }] }
```

The first message may carry the complete selection. Existing conversations submit the full set through a dedicated endpoint; revision conflicts return 409. Ordinary conversation options updates cannot change resource fields. Active executions and interrupted executions being resumed use an execution snapshot. New selections take effect on the next execution, while revoked permissions still block subsequent tool or collaborator calls from older snapshots.

Capabilities are attached only to the entry Agent and do not modify Assistant drafts or published graphs. Skill-loading support is added automatically when no Skills node is configured; without a sandbox, only files from authorized packages can be read. Remote MCP uses the existing OAuth, approval, and MCP Apps integration flows, without requiring Xpert-specific fields from the server. Changing MCP configuration through workspace operations invalidates the previous version binding. Middleware for the same provider is attached only once, and existing required middleware cannot be disabled. External expert references are pinned to a published ID and publication timestamp. Republishing the same ID invalidates the old binding, which must be published and selected again.

When the Assistant already has middleware for the same provider, its complete configuration takes precedence, with defaults supplied by the existing `configSchema`. Plugins reuse that capability without supplementing or overriding its configuration. Explicit `false`, `0`, `null`, and empty arrays are preserved; objects and arrays are not merged across sources. For example, if an existing image-viewing middleware has configuration `{}`, `compressionPercent` retains the schema default of `100` instead of being changed to a plugin's `50`.

When the Assistant has not configured the provider, the plugin configuration is used with schema defaults applied. If multiple plugins introduce the same provider, each complete configuration is normalized and validated separately. Equivalent configurations are deduplicated; differences produce an error identifying the provider and field. Plugin loading order never determines which values win, and errors never echo configuration values. These rules are implemented only on the server and do not require plugins to declare additional field policies. Resource validation and execution assembly use the same rules and always produce runtime copies, leaving the original Assistant and plugin configurations unchanged.

Streamable HTTP MCP is currently supported. stdio and legacy SSE entries are skipped with diagnostics. Marketplace subscriptions, legacy client manifest compatibility, arbitrary Agent URLs, and loading code from packages are not supported.

## APIs and SDK

All Xpert requests from ChatKit use `@xpert-ai/xpert-sdk`:

| SDK                                    | API (relative to `/api/ai`)                        |
| -------------------------------------- | -------------------------------------------------- |
| `assistants.getResources`              | `GET /assistants/:id/resources`                    |
| `assistants.validateResources`         | `POST /assistants/:id/resources/validate`          |
| `assistants.authorizeResource`         | `POST /assistants/:id/resources/authorize`         |
| `conversations.getRuntimeResources`    | `GET /conversations/:id/runtime-resources`         |
| `conversations.updateRuntimeResources` | `PUT /conversations/:id/runtime-resources`         |
| `connectors.runtimeOptions`            | `GET /assistants/:id/connectors`                   |
| `connectors.runtimeStatus`             | `GET /assistants/:id/connectors/:bindingId/status` |

Connector runtime reads accept Assistant-scoped ChatKit credentials under `/api/ai`. The readiness response contains only `bindingId`, `status`, and `granted`. Configuration, OAuth authorization, reconnection and disconnection remain on the administrator `/api/connector` API. Deploy these backend routes before updating the SDK and ChatKit; legacy management routes retain their existing authentication.

Queries support `projectId`, `search`, `kind`, `offset`, and `limit`. Administrator APIs are under `/api/agent-plugins`: `GET /`, `GET /options`, `POST /git`, `POST /zip`, `POST /bindings`, and `PUT /bindings/:id`. Use the optional `replacesBindingId` when publishing a replacement, or `{ "enabled": false }` to disable a binding.

## Storage and deployment

Apply `packages/server-ai/src/agent-plugin/migrations/20260921-agent-plugins.sql` and point `XPERT_AGENT_PLUGIN_PATH` to a persistent directory shared by all API and execution nodes. The default `storage/agent-plugins` is suitable for local development on a single node. Back up the database and package directory together; do not edit package directories after import.

Release order: backend and database migrations → SDK with resource APIs → ChatKit types/UI/Web Component → Xpert hosts. Preserve compatibility with older clients that have not enabled the entry point. After publishing the SDK, update ChatKit to that published version and refresh the lockfile. After publishing ChatKit, update the corresponding Xpert dependencies and lockfile. The current host uses published ChatKit Types/UI/Web Component 0.6.0, Angular 0.4.4, and Web Shared 0.4.5, with SDK 0.3.0 also pinned in the lockfile; local source linking is not required. Production deployment still requires database migrations and shared package storage configuration.

## Examples and validation

- See the [xpert-plugins quick start](https://github.com/xpert-ai/xpert-plugins/tree/main/agent-plugins) for standard packages, batch installation, and authorization flows for Exa, Notion, Linear, Supabase, Sentry, and Canva China. These reuse existing integration flows and do not require Codex manifest compatibility or a desktop runtime.
- See the [validation record](./VALIDATION.md) for automated checks, live calls, and outstanding pre-release validation items for this iteration.
- Unit tests: `corepack pnpm exec jest --config packages/server-ai/jest.config.ts --runInBand packages/server-ai/src/agent-plugin`.
- Local live-call validation uses a dedicated Assistant and a local Streamable HTTP test server, without modifying existing business Assistants.

Specification: [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md). `xpertai` is a host extension, not a built-in resource type in the standard.

## Agent Plugin and Connector authorization

The host uses `extensions.xpertai` as its current short namespace. Importing older
packages with `extensions["cn.xpertai"]` remains supported. When both keys exist,
`xpertai` takes precedence and must pass validation; their contents are not merged.

Standard packages declare dependencies by MCP server key through `extensions["xpertai"].connectors`:

```json
{
  "version": 1,
  "connectors": {
    "notion": { "type": "mcp_oauth" },
    "canva": { "type": "existing", "provider": "canva", "resource": "https://mcp.canva.cn" }
  }
}
```

- `mcp_oauth` automatically generates an organization-isolated Connector provider and creates a shared workspace connection. It reuses browser-bound OAuth callbacks, encrypted credential storage, refresh, and disconnection. Provider identity includes endpoint, scopes, and clientRegistration. The optional `clientRegistration: "preregistered"` uses the existing Connector configuration form. Dynamic client registration is the default, so no service-specific native plugin is required.
- `existing` maps only to shared workspace Connectors already created by administrators. Packages use logical providers and OAuth resource/scopes, without distributing machine-specific IDs or credentials. Canva clientId/clientSecret remain configured in the existing System Integration.
- MCP OAuth metadata discovery uses a separately pinned `@modelcontextprotocol/sdk-oauth`; the existing MCP transport SDK version is unchanged. Path-based protected-resource metadata, PKCE, and resource/audience validation are supported, using the existing constrained OAuth fetch implementation.
- Every request rechecks the current user, organization, workspace/project, published binding, persisted toolset configuration, Connector readiness, and resource scope. Credential-only Connectors are not shown as standalone middleware. MCP App execution context is stored only in server-side snapshots; authorization is checked again after reconnection.
- SDK `assistants.authorizeResource` returns workspace Connector status and configuration permissions. When authorized, ChatKit's **Connect account** action opens the host's target Connector connection flow directly through `composer.resources.onConnect({ assistantId, bindingId })`; otherwise, it prompts the user to contact an administrator. The host revalidates configuration permissions for the current Assistant, workspace, and binding, and reuses the workspace connection form and OAuth flow. It returns `{ status: "connected" | "cancelled" }` without passing credentials. ChatKit rechecks readiness before continuing the original capability selection; cancellation or failure preserves the draft. The iframe calls the host through the Web Component's `onConnectWorkspaceConnector` command.
- A server cannot declare both legacy `oauthServers` and `connectorServers`. Existing published versions and credentials are not migrated automatically. Enable Connectors by replacing the package with a new version. After administrators remove old personal connections and create new shared workspace connections, republish the plugin binding to update its connection references. Subsequent versions with matching endpoint/scopes reuse that workspace connection. Historical personal credentials are not copied, and there is no automatic migration from personal to shared connections. Native plugin installation scope rules remain unchanged.

Current validation uses published npm packages. Production rollout still requires deployment in the order backend → SDK → ChatKit.

## Workspace connection model

- Workspaces own connection configuration and credentials. Only workspace administrators can create, connect, reconnect, or disconnect them.
- At runtime, user permissions are checked through the published Assistant, and connections from that Assistant's workspace are used. Permissions and connection status are revalidated for every tool call.
- ChatKit's **Connect plugins** shows both standard plugins and executable Connector capabilities. Credential-dependency Connectors are not listed separately. The legacy **+ → Connectors** entry remains only for compatibility when the unified selector is not enabled.
- New client catalogs can use `includeWorkspace=true` to read workspace connections in a project context. Legacy project connections remain compatible. Graph providers use the Assistant workspace's connection when no legacy project configuration exists. Project permissions are still checked first, and a conversation cannot select multiple connections for the same provider at once.
- Management links always lead to workspace settings; no new **My connections** page is introduced. Legacy personal bindings no longer support reconnection or automatic conversion. In development environments, remove old bindings and their authorization sessions and usage grants, then create shared bindings and republish plugins that reference them. Legacy personal OAuth packages must publish a version declaring Connector dependencies.
