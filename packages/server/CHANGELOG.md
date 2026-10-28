# @xpert-ai/server-core

## 3.29.0

### Patch Changes

- 78cd9c0: Add ArtifactTypeProvider contributions with loader-owned namespace, explicit installation binding, content validation, sharing restrictions, and snapshot or authenticated presentation modes. Persist typeBinding on Artifact and deny unbound or unavailable types without fallback. Reuse the existing Artifact runtime API and Presentation Provider protocol.

    Implement conversation snapshots as a built-in Artifact plugin, retaining the ChatKit read-only message UI and source authorization. Add an isolated anonymous snapshot viewer without a query channel; keep authenticated queries scoped to the current viewer and matching plugin installation. Remove the previous host-only source-policy contract. Existing experimental untyped records are not automatically converted.

- 78cd9c0: Add revocable, expiring conversation text snapshots with organization membership checks, opt-in public links, a full-width Cloud viewer using ChatKit's read-only message list, preview validation, and bearer-token log protection. Project and group conversations cannot be exported. The shared renderer receives only authorized text and theme data, without live conversation credentials.

    Add a personal shared-links settings dialog with search, pagination, owner-only snapshot previews, and confirmed single/bulk revocation. Management excludes delegated Assistant credentials and preserves conversations and shares created after the reviewed cutoff.

    Persist conversation exports through existing Artifact containers, immutable ArtifactVersions and revocable ArtifactLinks. Reopening and copying reuse the stored URL. Enforce conversation source availability and export restrictions on shared Artifact content entrypoints, including raw URLs. No separate ConversationShare entity or token-recovery migration is introduced.

    Keep conversation rules in conversation-sharing as a built-in Artifact type plugin with Artifact-owned share queries. The conversation feature module registers its type and host view directly, without a separate built-in plugin aggregation module. Register through the SDK type protocol, persist the installation binding, and reject unavailable types without fallback. The former host-only source-policy interface is removed.

    Use the existing CLIENT_BASE_URL for share and management URLs, exposed through the shared clientBaseUrl bootstrap setting. Conversation sharing requires no feature-specific deployment configuration. Public sharing is available by default but still requires explicit owner confirmation; the default audience remains organization-only with a seven-day expiry.

- 3b03ad7: Delegate scoped database workbench discovery and location handling to registered plugins. Preserve actor authorization, source revision checks and independent connection cleanup without a built-in engine allowlist.

    Breaking SDK change: remove the legacy SQL adapter, dialect validation and quoting exports. Database plugins now own these implementations; SQL consumers migrate to the plugin-repository sql-workbench helpers. Strategies explicitly declare workbench support and runners accept the requested DatabaseLocation. Upgrade the MySQL/Doris, PostgreSQL, HANA and DB Studio plugins together with this SDK; old plugins without the registration opt-in are unavailable to the scoped workbench until upgraded.

- Updated dependencies [78cd9c0]
- Updated dependencies [78cd9c0]
- Updated dependencies [4b07221]
- Updated dependencies [b459105]
- Updated dependencies [78cd9c0]
- Updated dependencies [3b03ad7]
    - @xpert-ai/plugin-sdk@3.29.0
    - @xpert-ai/contracts@3.29.0
    - @xpert-ai/server-config@3.29.0
    - @xpert-ai/server-common@3.29.0

## 3.28.0

### Patch Changes

- b21c640: Persist MCP execution ownership before sending work, redeliver original-generation control and retain settlement until handlers and attached work actually finish. Add a negotiated control receipt, unique task admission, non-replaying input continuation, and conversation pause/termination bridges. Include conservative migration for legacy tasks.
- 4a22aea: Reconcile persisted plugin restart failures against the current server generation, retain operation identities across failures, and isolate browser state by authenticated scope. Fence restart publication atomically so stale tabs cannot replace newer desired plugin versions. Preserve exact runtime admission checks and server-owned setup activation.

    Separate browser persistence, schema validation, and restart reconciliation policy. Report invalid or unavailable storage explicitly, preserve in-memory state when persistence fails, and verify scoped records before removing legacy cache entries during migration.

- 47c4d17: Bind Sandbox jobs and host callbacks to durable execution generations. Redeliver original-target control, retain capacity until runtime and attached work actually settle, prevent implicit replay, and support explicit retries of settled generations. Add provider evidence and conservative legacy migration.
- a520041: Run registry plugin installation asynchronously with bounded execution and process-group cleanup. Serialize shared-store mutations across API replicas, validate legacy installations, publish complete artifacts and manifests atomically, and propagate staging failures before runtime activation. Keep admission deadlines and restart capacity checks intact; verify slow installations overlapping rolling restarts through readiness-aware ingress.
- f9b312a: Add a Project-scoped content catalog with explicit model and edit-protocol compatibility, editor preferences, safe source fallback and revision-bound search projections. Resolve stable catalog identities to authorized plugin selections, permit on-demand Project editor discovery independently of Assistant tools, and authorize Project-owned Artifact drafts through current member rights.

    Provide a reusable Assistant capability composition helper. Preserve unacknowledged and offline collaboration updates across reconnects, invalidate pre-archive CAS revisions on restore, and admit direct chat runs before persisting recovery checkpoints. Requires coordinated host, SDK, ChatKit and resource-plugin deployment.

    Keep failed collaboration projections retryable: reject failed queue attempts, recover stale durable checkpoints after restart, and replay only the latest active document state without requiring an open browser.

    Return explicit access/unavailability errors for stale client actions after a resource provider is uninstalled, while preserving authorized read-only source backups.

    Reuse the shared I18nObject contract for content type and implementation labels instead of introducing a separate mandatory bilingual shape.

    Persist credential-free, immutable create/copy intents and recover them after restart. Reconcile source projections and notify knowledge observers using current Project membership and Assistant access. Add revision-checked Artifact draft recycling that revokes shares atomically; restoring a draft never republishes previous links. Apply `20261026_content_operations.sql` before enabling the maintenance worker.

- Updated dependencies [4995ec0]
- Updated dependencies [9585d4e]
- Updated dependencies [1c7c7dc]
- Updated dependencies [15e3ad0]
- Updated dependencies [7535029]
- Updated dependencies [b21c640]
- Updated dependencies [4820bf3]
- Updated dependencies [4a22aea]
- Updated dependencies [8741bfe]
- Updated dependencies [47c4d17]
- Updated dependencies [a520041]
- Updated dependencies [f9b312a]
- Updated dependencies [a724133]
    - @xpert-ai/contracts@3.28.0
    - @xpert-ai/plugin-sdk@3.28.0
    - @xpert-ai/server-config@3.28.0
    - @xpert-ai/server-common@3.28.0

## 3.27.0

### Patch Changes

- 078e6fe: Allow trusted Artifact document hosts to opt into exact HTTPS origins for scripts, styles, fonts and images while preserving the offline default and blocking direct data requests, frames, workers and eval. Share resource checks between preview routing and the document CSP.

    Preserve safe analytics error codes, failure stages, retryability and localized repair guidance in both HTTP responses and Agent tool errors. Distinguish read-only SQL rejection, parameter binding failures and output contract mismatches without exposing private provider errors. Add browser isolation coverage and regression cases for parameterized Doris month filters.

- Updated dependencies [52a3241]
- Updated dependencies [147683a]
- Updated dependencies [d6efa08]
- Updated dependencies [078e6fe]
- Updated dependencies [c3509ee]
- Updated dependencies [de45823]
    - @xpert-ai/contracts@3.27.0
    - @xpert-ai/plugin-sdk@3.27.0
    - @xpert-ai/server-common@3.27.0
    - @xpert-ai/server-config@3.27.0

## 3.26.2

### Patch Changes

- 2e052d5: Expose current-request platform permissions without role-administration access,
  preserving live grants, JWT permission ceilings and tenant/organization isolation.

    Support explicit authentication strategies on controllers and routes. The current
    permissions endpoint requires JWT, while unannotated routes retain the open-source
    server's JWT/Basic defaults. Reject anonymous, Basic and API-key credentials on
    the permissions endpoint without marking it public or authenticating twice.

- b743428: Attribute providers and controllers returned by a plugin's dynamic `register()` module to their plugin scope and version before discovery. This lets Data Xpert verify managed middleware readiness instead of seeing those providers as built-in. Skip primitive provider values and string aliases when attaching reflection metadata.
- 32d695d: Withdraw API replicas from readiness-aware ingress before draining, refresh plugin admission independently of rollout bookkeeping, and expose validation and lease diagnostics. Preserve structured runtime errors in Desktop with bounded recovery for safe requests and clear recovered session errors. Compose deployments must route all API ingress through the new readiness-aware gateway.

    Give admission monitoring an independent provider lifecycle, validate a configurable ingress propagation budget, and distinguish runtime completion from ingress acknowledgement.

    Keep authenticated readiness independent of tenant settings, bound Redis cache reads and writes with database fallback, and stop queuing cache calls while timed-out operations remain pending.

- c59009d: Preserve known Sandbox Runtime dependency error codes across the Analytics boundary with safe, localized remediation and retry policy. Keep arbitrary plugin HTTP errors, messages and execution details redacted.

    Allow targeted Runtime family publication without npm publication or rebuilding already published families, and verify the full API manifest contract before image promotion.

    Report invalid Action script inputs separately from Runtime startup failures, with fixed guidance about the Workspace script entrypoint and standard-library contract. Runner output remains private.

- Updated dependencies [d80b159]
- Updated dependencies [389933d]
- Updated dependencies [32d695d]
    - @xpert-ai/plugin-sdk@3.26.2
    - @xpert-ai/contracts@3.26.2
    - @xpert-ai/server-common@3.26.2
    - @xpert-ai/server-config@3.26.2

## 3.26.1

### Patch Changes

- c553b26: Introduce one canonical Analytics source model and runtime for database connections, versioned Definitions and Artifacts. Add scoped configuration management and settings UI, and restrict DataSource Types to real database drivers. Remove versioned protocol adapters and migration inventory. Analytics plugins and saved documents must use the canonical source envelope; this release intentionally does not decode historical Bindings.

    Use the shared JSON Schema form and Zard controls for Analytics settings, including nested schema references, union choices and JSON values. Fix the settings navigation icon.

    Add scoped Agent definition authoring, provider inspection/preflight, and retry-safe immutable registration. Make Analytics settings a management-only surface.

    Resolve unnamed MCP servers consistently between automatic definition discovery and the MCP runtime, and reject ambiguous normalized server identities.

    Explain duplicate-grain validation failures to Agent tools without exposing upstream errors, enabling repair of search-result tables that contain multiple snippets per URL.

- 37ae32f: Centralize GitHub App settings in system integrations, including App slug and protected credential fields. Reuse the built-in integration read permission service for signed callbacks, with tenant-only integration selection and secret-preserving partial updates.

    Add an optional integration.readConfiguration(id) capability bound to the plugin scope by the host. Validate tenant, organization and declared integration access inside the capability; system configuration resolves in the Default tenant without request context. Keep existing runtime read APIs compatible and keep PluginContext free of configuration storage details.

    Return a client validation error for invalid plugin configuration without exposing rejected configuration values.

    Add a validated, provider-independent workspace Connector command contract with optional authentication-method and system-integration constraints. Resolve capabilities from Connector declarations for both OAuth and API key methods, pin the host-owned dialog, and reject conflicting active or pending shared connections. Keep provider-specific policies and error guidance in plugins.

    Keep narrowly scoped login and plugin recovery routes reachable through their existing authentication and authorization guards when plugin version drift makes the runtime unready. Continue fencing business traffic and all new requests during shutdown drain.

    Move GitHub System Integration into the automatically loaded built-in plugin. Register its metadata and configuration handling through IntegrationStrategy, add a generic prepareConfig hook, and preserve existing integration IDs, provider keys, OAuth-only settings and saved secrets.

- Updated dependencies [c553b26]
- Updated dependencies [d55c27c]
- Updated dependencies [a6f9323]
- Updated dependencies [37ae32f]
    - @xpert-ai/contracts@3.26.1
    - @xpert-ai/plugin-sdk@3.26.1
    - @xpert-ai/server-common@3.26.1
    - @xpert-ai/server-config@3.26.1

## 3.26.0

### Patch Changes

- 54778dc: Extend the existing schema-sync deployment job with TypeORM SQL migrations. Ordinary tables still synchronize from entities; explicitly SQL-managed tables are excluded. Package module-local SQL and checks, preserve migration checksums, support verified baseline adoption, and serialize host/plugin DDL using a shared PostgreSQL lock.

    Disable API startup DDL in development as well as production. Share installed plugin mounts with Compose migration jobs and fail on incomplete plugin registration. Preserve legitimate undispatched ModelExecution calls during baseline adoption, with regression coverage for independently reconstructed legacy databases.

- Updated dependencies [f0590e2]
- Updated dependencies [23b505e]
- Updated dependencies [d3ad3a5]
- Updated dependencies [54778dc]
    - @xpert-ai/contracts@3.26.0
    - @xpert-ai/server-config@3.26.0
    - @xpert-ai/plugin-sdk@3.26.0
    - @xpert-ai/server-common@3.26.0

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.

### Patch Changes

- 27fab44: Resume pending plugin rollouts when API capacity recovers, preserve last-replica outage approval and generation fencing, and keep the plugin settings page tracking waiting releases until completion.
- Updated dependencies [3e0460d]
- Updated dependencies [babce0b]
- Updated dependencies [c2b52ba]
- Updated dependencies [ba77738]
- Updated dependencies [4ff6010]
- Updated dependencies [0f55121]
- Updated dependencies [8a0c256]
- Updated dependencies [854a4c0]
- Updated dependencies [1b5096f]
- Updated dependencies [1cd5a33]
    - @xpert-ai/server-common@3.25.0
    - @xpert-ai/server-config@3.25.0
    - @xpert-ai/contracts@3.25.0
    - @xpert-ai/plugin-sdk@3.25.0

## 3.10.9

### Patch Changes

- Updated dependencies [2e7af88]
    - @xpert-ai/plugin-sdk@3.24.0

## 3.10.8

### Patch Changes

- c4f9bb3: Add organization member sharing and scoped user-group authorization for Assistants. Separate resource sharing from organization group management, enforce active organization membership and runtime-only grants, and keep access changes consistent across published versions.

    Use the existing Zard UI theme for the sharing page and hide group authorization when the account cannot view organization user groups.

- 2e488be: Manage data retention exclusively from the default tenant and apply its cleanup switches and retention periods to all tenants. Ignore other tenants' previous retention overrides, preserve conversation references and pending settlements, and retain model usage facts when removing expired call records. Only default-tenant SuperAdmins can change these global policies; missing or disabled default policies do not trigger cleanup.

    Keep retention parameters out of the generic tenant settings editor and only display saved changes after the request succeeds. Failed saves preserve the original value and editable draft and show an error.

- Updated dependencies [c4f9bb3]
    - @xpert-ai/contracts@3.23.0
    - @xpert-ai/plugin-sdk@3.23.1

## 3.10.7

### Patch Changes

- 4bf9514: Allow integrations without a registered strategy, including GitHub, to be updated and deleted. Reuse the existing scoped registry lookup for optional validation and lifecycle hooks, while preserving lookup errors and failures from registered hooks. Required strategy operations remain unchanged.
- Updated dependencies [5afe7d1]
- Updated dependencies [94dd967]
- Updated dependencies [8ecf7b0]
- Updated dependencies [94dd967]
- Updated dependencies [616bab6]
- Updated dependencies [616bab6]
- Updated dependencies [ddeb74f]
    - @xpert-ai/contracts@3.22.0
    - @xpert-ai/plugin-sdk@3.23.0

## 3.10.6

### Patch Changes

- 4e29238: Resolve Agent Plugin connector definitions from persisted tenant and organization configuration so catalogs, OAuth callbacks and runtime calls work across API replicas and restarts. Preserve historical connector identities and authentication methods when a native provider replaces generic MCP OAuth.

    Allow supported connectors to select or create a system integration in the connection dialog, remember its ID for reconnects, and resolve application credentials using the connection's persisted scope. Generate integration names automatically and deduplicate retries. GitHub requires the companion GitHub Connector plugin update to expose this flow and replace dynamic client registration.

- 3b7f2cd: Extend the existing api_key table and authentication flow with USER-bound personal keys in account settings, with one-time secret display, hashed storage, expiration and revocation. Use the same endpoints and authentication flow as existing API keys, restoring the personal key's human owner and current permissions. Preserve ordinary login-only management endpoints and the existing resource-key and ChatKit session flows; no personal-key-specific route opt-in is required.

    Instances that tested the separate-table draft can preserve those credentials with the one-time `packages/server/src/api-key/personal-api-key/migrate-personal-api-keys.sql` script after schema synchronization.

- 2f25689: Distinguish validated view host types and view keys in HTTP request metric routes so Grafana can rank individual views. Keep host IDs and query values out of metric labels, and preserve generic route templates for unresolved or unauthorized views.
- Updated dependencies [4e29238]
- Updated dependencies [3b7f2cd]
    - @xpert-ai/plugin-sdk@3.22.2
    - @xpert-ai/contracts@3.21.3

## 3.10.5

### Patch Changes

- f60db7b: Exclude expired and unready replica registrations from plugin rollouts, validate returning replicas before admitting traffic, and restart one candidate at a time. Preserve healthy peers on failure, add bounded plugin startup diagnostics and an event-loop-independent watchdog, and restore verified last-known-good plugin configurations without retrying failed recovery indefinitely.

    Protect the last healthy replica unless an authorized operator explicitly permits downtime. Pin replacement admission to the active generation's cumulative plugin manifest so queued updates cannot block the current rollout or inherit outage consent.

- Updated dependencies [f60db7b]
- Updated dependencies [558b1cd]
    - @xpert-ai/contracts@3.21.2
    - @xpert-ai/plugin-sdk@3.22.1

## 3.10.4

### Patch Changes

- 795f24a: Unify managed Assistant application state under WorkspaceFilesRuntimeCapability.appData(). Resolve namespaces from loaded plugin metadata; revalidate the current actor and published Assistant on every operation. Shared workspaces remain supported unless the application requires user isolation. Reuse atomic Volume writes and shared-filesystem locks, and protect .apps from generic Files, downloads, parser inputs and sandbox file uploads. Preserve Studio draft access through explicit authoring authority.

    NsJail Runner protocol 3 masks .apps with an empty read-only mount and blocks file RPC access. Upgrade the Runner before the API; older Runners fail closed. Local Shell is trusted development execution and does not provide OS isolation. No old application data is migrated.

    Pin application handles to their original workspace, and reject private file projections after a switch to shared storage. Renew lock leases only after successful filesystem heartbeats, verify lock ownership before mutations, and preserve replacement owners on release. Reject root aliases into managed data and protect managed descendants during recursive deletion.

- a2e5e2c: Check required permissions by membership instead of counting matching role records. Duplicate enabled grants no longer deny Project catalogs or substitute for a different missing permission. Apply the same behavior to the server and Plugin SDK request contexts.
- 672810f: Preserve authorized MCP App results after interactive sessions expire and allow explicit recovery without rerunning the original tool. Recheck current message, Assistant and connector access, prevent stale replicas from replacing renewed sessions, and remove saved history with its owning conversation or messages.

    Expose a server-only View middleware runtime capability so plugins can reuse authorized Assistant configuration and connector bindings without inventing an Agent execution. Redact session credentials from HTTP request URLs and query logs.

    When TypeORM schema synchronization is disabled, apply `packages/server-ai/src/mcp-app-runtime/migrations/20261012-mcp-app-history.sql` before deploying the history and recovery endpoints.

- 97b58fc: Restrict plugin installation schema synchronization to the current plugin's tables and owned join tables while retaining reference metadata for foreign keys. Prevent runtime entity registration from synchronizing the whole database, so installing one plugin does not alter host tables or unrelated plugins such as DOCX Editor.
- Updated dependencies [e42fc94]
- Updated dependencies [795f24a]
- Updated dependencies [7de8eae]
- Updated dependencies [f304e7b]
- Updated dependencies [d9db433]
- Updated dependencies [a2e5e2c]
- Updated dependencies [672810f]
- Updated dependencies [f816d25]
    - @xpert-ai/contracts@3.21.1
    - @xpert-ai/plugin-sdk@3.22.0

## 3.10.3

### Patch Changes

- Updated dependencies [ae1fb5f]
    - @xpert-ai/plugin-sdk@3.21.1

## 3.10.2

### Patch Changes

- c5e19d5: Make plugin runtime convergence account for registered API replicas without a fixed registration window. Retain failed rollout outcomes, guard late replica catch-up, allow authorized retirement of offline instances, and synchronize organization plugin removals. Hide manual restart prompts from non-SuperAdmin users while retaining background progress.
- 4b7a346: Add plugin installation as the final system setup step, with a paginated marketplace catalog, plugin details, filters, grouping, and selection across pages using Zard UI. Install selected plugins sequentially, skip failures, optionally import the official Agent plugins, and defer runtime activation until the batch finishes. Persist installation progress, resume interrupted work, and enter the organization only after runtime convergence completes.
- Updated dependencies [eecb9fa]
- Updated dependencies [f76a9c9]
- Updated dependencies [c9f9379]
- Updated dependencies [eecb9fa]
- Updated dependencies [c5e19d5]
- Updated dependencies [4b7a346]
- Updated dependencies [4fff330]
- Updated dependencies [82b8db4]
    - @xpert-ai/contracts@3.21.0
    - @xpert-ai/plugin-sdk@3.21.0

## 3.10.1

### Patch Changes

- 01fd502: Add the on-demand Conversation Map Workbench View with shared shadcn controls, React Flow layouts, searchable conversation and branch navigation, and host-backed display preferences. Include compact directory rows, content-sized cards, accessible action tooltips, and reproducible source builds.

    Use `agent.workbench` as the canonical Assistant Workbench slot. Normalize legacy `agent.workbench.fixed` and `agent.workbench.main` requests and plugin declarations at the host boundary, preserving authorization and opening preferences without duplicate views.

- b86bba1: Provide a shared CQRS entry point for resolving user organization access, keeping role-specific access policy out of business callers. Add a reusable Zod request-validation pipe and skip plugin schema synchronization when a plugin declares no entities.
- Updated dependencies [d18aa7f]
- Updated dependencies [b86bba1]
- Updated dependencies [a01cd48]
- Updated dependencies [1df94f0]
- Updated dependencies [bf33018]
- Updated dependencies [bf33018]
- Updated dependencies [aa33949]
- Updated dependencies [d4dba33]
- Updated dependencies [01fd502]
- Updated dependencies [deff039]
- Updated dependencies [b66bdcc]
- Updated dependencies [b86bba1]
- Updated dependencies [f5add6a]
- Updated dependencies [c941907]
- Updated dependencies [c0dd14c]
- Updated dependencies [00b626e]
- Updated dependencies [3142346]
- Updated dependencies [3185f56]
- Updated dependencies [98a7367]
- Updated dependencies [55ec356]
- Updated dependencies [00db21e]
- Updated dependencies [fffb0f4]
- Updated dependencies [d81dbe2]
- Updated dependencies [a131790]
    - @xpert-ai/contracts@3.20.0
    - @xpert-ai/plugin-sdk@3.20.0

## 3.10.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- b62543f: Add editable prompt workflow scenarios, organization tags, expert associations, and expert-scoped capability selections. Refresh prompt management and command availability, preserve explicit field clearing, and send expanded editable prompts without expanding them again on the server.

    Requires the ChatKit types and UI release that introduces prompt scenarios and editable prompt drafts; update the host's ChatKit dependencies to that published release before shipping.

- Updated dependencies [8a78318]
- Updated dependencies [1e44173]
- Updated dependencies [c953822]
- Updated dependencies [b7983c8]
- Updated dependencies [08f66e7]
- Updated dependencies [b62543f]
- Updated dependencies [5f26e05]
- Updated dependencies [99d09ec]
    - @xpert-ai/contracts@3.19.0
    - @xpert-ai/plugin-sdk@3.19.0
    - @xpert-ai/server-common@3.10.0
    - @xpert-ai/server-config@3.10.0

## 3.9.53

### Patch Changes

- Updated dependencies [5213185]
    - @xpert-ai/plugin-sdk@3.18.7

## 3.9.52

### Patch Changes

- Updated dependencies [9a2a2a0]
- Updated dependencies [a8a251d]
- Updated dependencies [089e3ff]
- Updated dependencies [983b730]
    - @xpert-ai/contracts@3.18.6
    - @xpert-ai/plugin-sdk@3.18.6

## 3.9.51

### Patch Changes

- 95ec638: Add asynchronous knowledgebase automatic tagging with bounded document samples, numbered existing-label classification, strict server validation, model fallback, and idempotent incremental associations. Reuse organization/tenant Tag definitions with knowledgebase-scoped selection and preserve manual labels across concurrent classification and retries. Count explicit knowledge associations in the existing directory and protect referenced tags. Run standalone schema-sync before enabling the new code.
- Updated dependencies [6a51c17]
- Updated dependencies [95ec638]
- Updated dependencies [8402f72]
    - @xpert-ai/contracts@3.18.5
    - @xpert-ai/plugin-sdk@3.18.5

## 3.9.50

### Patch Changes

- Updated dependencies [3f72082]
- Updated dependencies [7b97fee]
- Updated dependencies [4be390b]
- Updated dependencies [63cd444]
- Updated dependencies [4e8c7ed]
    - @xpert-ai/contracts@3.18.4
    - @xpert-ai/plugin-sdk@3.18.4

## 3.9.49

### Patch Changes

- Updated dependencies [d107704]
    - @xpert-ai/contracts@3.18.2
    - @xpert-ai/plugin-sdk@3.18.3

## 3.9.48

### Patch Changes

- Updated dependencies [e260743]
    - @xpert-ai/plugin-sdk@3.18.2
    - @xpert-ai/contracts@3.18.1

## 3.9.47

### Patch Changes

- Updated dependencies [a86016e]
    - @xpert-ai/plugin-sdk@3.18.1

## 3.9.46

### Patch Changes

- Updated dependencies [477b711]
- Updated dependencies [dad112d]
- Updated dependencies [8e63a8b]
- Updated dependencies [1c71b75]
- Updated dependencies [d45a0c8]
    - @xpert-ai/plugin-sdk@3.18.0
    - @xpert-ai/contracts@3.18.0

## 3.9.45

### Patch Changes

- Updated dependencies [afb69b7]
    - @xpert-ai/contracts@3.17.6
    - @xpert-ai/plugin-sdk@3.17.6

## 3.9.44

### Patch Changes

- Updated dependencies [9e59e41]
    - @xpert-ai/contracts@3.17.5
    - @xpert-ai/plugin-sdk@3.17.5

## 3.9.43

### Patch Changes

- Updated dependencies [7b6954a]
    - @xpert-ai/plugin-sdk@3.17.4
    - @xpert-ai/contracts@3.17.4

## 3.9.42

### Patch Changes

- Updated dependencies [754866e]
    - @xpert-ai/plugin-sdk@3.17.3
    - @xpert-ai/contracts@3.17.3

## 3.9.41

### Patch Changes

- Updated dependencies [fa1306a]
    - @xpert-ai/contracts@3.17.2
    - @xpert-ai/plugin-sdk@3.17.2

## 3.9.40

### Patch Changes

- Updated dependencies [612baea]
    - @xpert-ai/contracts@3.17.1
    - @xpert-ai/plugin-sdk@3.17.1

## 3.9.39

### Patch Changes

- 3c16d3a: Add an optional dedicated proxy for plugin marketplace HTTP requests.
- Updated dependencies [747732e]
- Updated dependencies [e44e5bc]
    - @xpert-ai/plugin-sdk@3.17.0
    - @xpert-ai/contracts@3.17.0

## 3.9.38

### Patch Changes

- Updated dependencies [57721a6]
    - @xpert-ai/plugin-sdk@3.16.1

## 3.9.37

### Patch Changes

- Updated dependencies [b800da5]
    - @xpert-ai/plugin-sdk@3.16.0
    - @xpert-ai/contracts@3.16.0

## 3.9.36

### Patch Changes

- 2f6bf18: Support localized plugin display names and descriptions across plugin metadata, the platform registry, and marketplace dialogs.
- Updated dependencies [2f6bf18]
    - @xpert-ai/contracts@3.15.18
    - @xpert-ai/plugin-sdk@3.15.18

## 3.9.35

### Patch Changes

- Updated dependencies [0a90701]
    - @xpert-ai/plugin-sdk@3.15.17
    - @xpert-ai/contracts@3.15.17

## 3.9.34

### Patch Changes

- Updated dependencies [90a268b]
    - @xpert-ai/contracts@3.15.16
    - @xpert-ai/plugin-sdk@3.15.16

## 3.9.33

### Patch Changes

- Updated dependencies [a26a776]
- Updated dependencies [8a0eba3]
- Updated dependencies [5d4a308]
- Updated dependencies [e3d3c26]
    - @xpert-ai/plugin-sdk@3.15.15
    - @xpert-ai/contracts@3.15.15

## 3.9.32

### Patch Changes

- Updated dependencies [8a46f00]
    - @xpert-ai/contracts@3.15.14
    - @xpert-ai/plugin-sdk@3.15.14

## 3.9.31

### Patch Changes

- Updated dependencies [25664c9]
- Updated dependencies [b269a84]
    - @xpert-ai/contracts@3.15.13
    - @xpert-ai/plugin-sdk@3.15.13

## 3.9.30

### Patch Changes

- Updated dependencies [b8bac1f]
- Updated dependencies [b905a58]
    - @xpert-ai/contracts@3.15.12
    - @xpert-ai/plugin-sdk@3.15.12

## 3.9.29

### Patch Changes

- Updated dependencies [aa16ee9]
    - @xpert-ai/plugin-sdk@3.15.11
    - @xpert-ai/contracts@3.15.11

## 3.9.28

### Patch Changes

- Updated dependencies [c9d8401]
    - @xpert-ai/plugin-sdk@3.15.10
    - @xpert-ai/contracts@3.15.10

## 3.9.27

### Patch Changes

- Updated dependencies [601438f]
    - @xpert-ai/plugin-sdk@3.15.9
    - @xpert-ai/contracts@3.15.9

## 3.9.26

### Patch Changes

- Updated dependencies [7ab7aa1]
- Updated dependencies [121ced0]
    - @xpert-ai/contracts@3.15.8
    - @xpert-ai/plugin-sdk@3.15.8

## 3.9.25

### Patch Changes

- Updated dependencies [5e553ae]
    - @xpert-ai/plugin-sdk@3.15.7

## 3.9.24

### Patch Changes

- Updated dependencies [3249145]
    - @xpert-ai/plugin-sdk@3.15.6
    - @xpert-ai/contracts@3.15.7

## 3.9.23

### Patch Changes

- Updated dependencies [0473ce2]
    - @xpert-ai/plugin-sdk@3.15.5
    - @xpert-ai/contracts@3.15.6

## 3.9.22

### Patch Changes

- Updated dependencies [693806f]
    - @xpert-ai/plugin-sdk@3.15.4
    - @xpert-ai/contracts@3.15.5

## 3.9.21

### Patch Changes

- Updated dependencies [bdcb73b]
    - @xpert-ai/plugin-sdk@3.15.3
    - @xpert-ai/contracts@3.15.4

## 3.9.20

### Patch Changes

- Updated dependencies [481ffba]
    - @xpert-ai/plugin-sdk@3.15.2
    - @xpert-ai/contracts@3.15.3

## 3.9.19

### Patch Changes

- Updated dependencies [8fded17]
    - @xpert-ai/plugin-sdk@3.15.1
    - @xpert-ai/contracts@3.15.2

## 3.9.18

### Patch Changes

- Updated dependencies [c1e4da2]
    - @xpert-ai/plugin-sdk@3.15.0
    - @xpert-ai/contracts@3.15.1

## 3.9.17

### Patch Changes

- Updated dependencies [6f679b8]
    - @xpert-ai/plugin-sdk@3.14.0
    - @xpert-ai/contracts@3.15.0

## 3.9.16

### Patch Changes

- Updated dependencies [54cff15]
- Updated dependencies [6978bfd]
    - @xpert-ai/plugin-sdk@3.13.0
    - @xpert-ai/contracts@3.14.0

## 3.9.15

### Patch Changes

- Updated dependencies [f23228b]
    - @xpert-ai/plugin-sdk@3.12.2

## 3.9.14

### Patch Changes

- Updated dependencies [6a17eca]
    - @xpert-ai/plugin-sdk@3.12.1

## 3.9.13

### Patch Changes

- Updated dependencies [d017897]
    - @xpert-ai/plugin-sdk@3.12.0

## 3.9.12

### Patch Changes

- Updated dependencies [7418eef]
    - @xpert-ai/plugin-sdk@3.11.2

## 3.9.11

### Patch Changes

- Updated dependencies [d92d0f2]
    - @xpert-ai/plugin-sdk@4.0.0

## 3.9.10

### Patch Changes

- Updated dependencies [49101da]
    - @xpert-ai/plugin-sdk@3.11.0

## 3.9.9

### Patch Changes

- Updated dependencies [a83c9ea]
    - @xpert-ai/plugin-sdk@3.10.0

## 3.9.8

### Patch Changes

- Updated dependencies [df9d7e2]
    - @xpert-ai/plugin-sdk@4.0.0

## 3.9.7

### Patch Changes

- @xpert-ai/plugin-sdk@3.9.9

## 3.9.6

### Patch Changes

- Updated dependencies [2558760]
    - @xpert-ai/plugin-sdk@3.9.8

## 3.9.5

### Patch Changes

- Updated dependencies [9e37ff9]
    - @xpert-ai/plugin-sdk@3.9.5

## 3.9.4

### Patch Changes

- @xpert-ai/plugin-sdk@3.9.4

## 3.9.3

### Patch Changes

- Updated dependencies [ea234e5]
    - @xpert-ai/plugin-sdk@3.9.3

## 3.9.2

### Patch Changes

- Updated dependencies [8187f99]
    - @xpert-ai/plugin-sdk@3.9.2

## 3.9.1

### Patch Changes

- Updated dependencies [e040933]
    - @xpert-ai/plugin-sdk@3.9.1

## 3.9.0

### Patch Changes

- Updated dependencies [4dcf5b5]
- Updated dependencies [7fff870]
- Updated dependencies [c76facd]
- Updated dependencies [5b5c8ef]
    - @xpert-ai/plugin-sdk@3.9.0

## 3.9.0-beta.2

### Patch Changes

- Updated dependencies
    - @xpert-ai/plugin-sdk@3.9.0-beta.2

## 3.9.0-beta.1

### Patch Changes

- Updated dependencies
    - @xpert-ai/plugin-sdk@3.9.0-beta.1
