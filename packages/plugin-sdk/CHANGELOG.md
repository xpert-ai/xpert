# @xpert-ai/plugin-sdk

## 3.29.0

### Minor Changes

- 78cd9c0: Expose project Artifact references through Content Catalog and the Artifact Library capability. Add authenticated read-only viewing, pinned version selection, reusable sharing and explicit copy policy without creating shares during collection or viewing.

  Expose provider-owned localized Artifact type names in Spaces lists, cards and share management so shared conversations remain recognizable independently of the reference relationship.

- 78cd9c0: Add ArtifactTypeProvider contributions with loader-owned namespace, explicit installation binding, content validation, sharing restrictions, and snapshot or authenticated presentation modes. Persist typeBinding on Artifact and deny unbound or unavailable types without fallback. Reuse the existing Artifact runtime API and Presentation Provider protocol.

  Implement conversation snapshots as a built-in Artifact plugin, retaining the ChatKit read-only message UI and source authorization. Add an isolated anonymous snapshot viewer without a query channel; keep authenticated queries scoped to the current viewer and matching plugin installation. Remove the previous host-only source-policy contract. Existing experimental untyped records are not automatically converted.

- 4b07221: Add the built-in administrator execution-observability plugin with an expandable Assistant/conversation timeline and five read-only analysis tools. Reuse scoped existing execution and usage records, preserve unknown lifecycle phases and costs, and ship shared shadcn/Tailwind remote assets without new tables.

### Patch Changes

- 3b03ad7: Delegate scoped database workbench discovery and location handling to registered plugins. Preserve actor authorization, source revision checks and independent connection cleanup without a built-in engine allowlist.

  Breaking SDK change: remove the legacy SQL adapter, dialect validation and quoting exports. Database plugins now own these implementations; SQL consumers migrate to the plugin-repository sql-workbench helpers. Strategies explicitly declare workbench support and runners accept the requested DatabaseLocation. Upgrade the MySQL/Doris, PostgreSQL, HANA and DB Studio plugins together with this SDK; old plugins without the registration opt-in are unavailable to the scoped workbench until upgraded.

- Updated dependencies [78cd9c0]
- Updated dependencies [78cd9c0]
- Updated dependencies [4b07221]
- Updated dependencies [b459105]
- Updated dependencies [78cd9c0]
  - @xpert-ai/contracts@3.29.0

## 3.28.0

### Minor Changes

- 15e3ad0: Preserve durable MCP control delivery and checkpoint tool identity across replicas and input continuation. Keep task receipts separate from business output, complete official recovery migrations, and verify the full Assistant/Pipeline-to-Sandbox chain with independent processes and storage.

  Require actual AssistantTask settlement evidence before Pipeline cancellation completes, and register the control entities in the official schema catalog.

- 7535029: Support automatic Agent runtime bindings across Computer, SDK, process and external service transports. Preserve existing execution protocols and interactive approvals while removing user profile/binding forms. Derive authorization from the current actor and Assistant, and resolve launch settings from installed strategies through a scoped capability, without a host runtime inventory. Old configuration is not migrated or reused.
- b21c640: Persist MCP execution ownership before sending work, redeliver original-generation control and retain settlement until handlers and attached work actually finish. Add a negotiated control receipt, unique task admission, non-replaying input continuation, and conversation pause/termination bridges. Include conservative migration for legacy tasks.
- 4820bf3: Add pinned runtime host/generation targets, descendant completion evidence, original-host control compensation, and a shared process supervisor. Legacy receipts remain unconfirmed; unsupported supervision cannot release controlled work.
- 47c4d17: Bind Sandbox jobs and host callbacks to durable execution generations. Redeliver original-target control, retain capacity until runtime and attached work actually settle, prevent implicit replay, and support explicit retries of settled generations. Add provider evidence and conservative legacy migration.
- f9b312a: Add a Project-scoped content catalog with explicit model and edit-protocol compatibility, editor preferences, safe source fallback and revision-bound search projections. Resolve stable catalog identities to authorized plugin selections, permit on-demand Project editor discovery independently of Assistant tools, and authorize Project-owned Artifact drafts through current member rights.

  Provide a reusable Assistant capability composition helper. Preserve unacknowledged and offline collaboration updates across reconnects, invalidate pre-archive CAS revisions on restore, and admit direct chat runs before persisting recovery checkpoints. Requires coordinated host, SDK, ChatKit and resource-plugin deployment.

  Keep failed collaboration projections retryable: reject failed queue attempts, recover stale durable checkpoints after restart, and replay only the latest active document state without requiring an open browser.

  Return explicit access/unavailability errors for stale client actions after a resource provider is uninstalled, while preserving authorized read-only source backups.

  Reuse the shared I18nObject contract for content type and implementation labels instead of introducing a separate mandatory bilingual shape.

  Persist credential-free, immutable create/copy intents and recover them after restart. Reconcile source projections and notify knowledge observers using current Project membership and Assistant access. Add revision-checked Artifact draft recycling that revokes shares atomically; restoring a draft never republishes previous links. Apply `20261026_content_operations.sql` before enabling the maintenance worker.

### Patch Changes

- 9585d4e: Resolve custom native model capabilities and credentials from the authorized provider model record. Pass the selected model's reasoning effort to Codex, accept namespaces containing only client-executed Responses tools, preserve budget callbacks across separate LangChain module copies, and report sanitized native transport diagnostics.
- 8741bfe: Report old/new argument line counts and actual file additions/deletions after sandbox edits. Compute line differences in the existing sandbox process without Git or temporary files, with bounded comparison work for broad rewrites. Unchanged replacements succeed with a zero diff. Sequential batches retain per-edit feedback and partial progress; unavailable statistics never prevent editing.
- Updated dependencies [4995ec0]
- Updated dependencies [1c7c7dc]
- Updated dependencies [15e3ad0]
- Updated dependencies [b21c640]
- Updated dependencies [4820bf3]
- Updated dependencies [4a22aea]
- Updated dependencies [47c4d17]
- Updated dependencies [f9b312a]
- Updated dependencies [a724133]
  - @xpert-ai/contracts@3.28.0

## 3.27.0

### Minor Changes

- 52a3241: Let Assistant capability providers explicitly opt into parameter-free creation switches through supportsQuickCreation. Cloud discovers these options from the server instead of hardcoding Project management, so Spaces and future plugins can participate without bespoke UI. Preserve model authorization, existing capabilities and revision-checked composition; apply and save all selected capabilities before publication.
- 078e6fe: Allow trusted Artifact document hosts to opt into exact HTTPS origins for scripts, styles, fonts and images while preserving the offline default and blocking direct data requests, frames, workers and eval. Share resource checks between preview routing and the document CSP.

  Preserve safe analytics error codes, failure stages, retryability and localized repair guidance in both HTTP responses and Agent tool errors. Distinguish read-only SQL rejection, parameter binding failures and output contract mismatches without exposing private provider errors. Add browser isolation coverage and regression cases for parameterized Doris month filters.

### Patch Changes

- 147683a: Preserve reasoning and cache token details in priced LLM receipts so Model Gateway can validate and settle reasoning-model calls. Keep usage with unavailable or inconsistent pricing pending settlement instead of treating it as a successful zero-point charge. Add regression coverage from the SDK callback through gateway validation and idempotent membership ledger settlement.
- d6efa08: Keep API startup available when an external plugin pipeline contribution fails contract validation, including legacy templates that omit projectTypes. Isolate constructor and discovery validation failures, exclude invalid contributions from the catalog, and report scoped diagnostics without payload values. Preserve strict explicit registration, built-in validation, dependency injection and non-validation errors.
- c3509ee: Expose `ProjectAssistantBinding` and return `assistantBindings` from managed Project provisioning so native pipeline applications can bind role executors by plugin, template and agent identity. These are resolved role requirements; `xpertIds` remains the Project membership list.
- de45823: Keep document source contracts browser-safe and include their transitive types in
  the isolated Cloud build. Register durable display snapshots and conversation
  revisions in the packaged SQL migration flow so clean databases initialize in
  dependency order and existing deployments receive the required fields.
- Updated dependencies [52a3241]
  - @xpert-ai/contracts@3.27.0

## 3.26.2

### Patch Changes

- d80b159: Include Poppler and validate LibreOffice, fonts and two-page UTF-8 extraction before document preview execution. Add the isolated LibreOffice NsJail binding and retain dependency, conversion, extraction and timeout diagnostics. Publish a new Runtime Suite artifact and regenerate production digest bindings through the release workflow; existing production locks are not changed by this source fix.
- 389933d: Require pipeline templates to declare their supported application and project types. Filter the configuration catalog and enforce the persisted project type when saving configurations and starting runs, so templates cannot execute in unrelated projects.

  Upgrade pipeline contributions together with the host and create compatible configurations for typed projects; legacy definitions without an explicit project type are not implicitly accepted. Preserve runtime scope in the remote-view preview host for realistic plugin verification.

  This release intentionally remains on the 3.x patch line. Before upgrading, add
  explicit `projectTypes` declarations to existing pipeline contributions and saved
  templates. Older templates are rejected; no compatibility fallback is provided.

- Updated dependencies [389933d]
- Updated dependencies [32d695d]
  - @xpert-ai/contracts@3.26.2

## 3.26.1

### Patch Changes

- c553b26: Introduce one canonical Analytics source model and runtime for database connections, versioned Definitions and Artifacts. Add scoped configuration management and settings UI, and restrict DataSource Types to real database drivers. Remove versioned protocol adapters and migration inventory. Analytics plugins and saved documents must use the canonical source envelope; this release intentionally does not decode historical Bindings.

  Use the shared JSON Schema form and Zard controls for Analytics settings, including nested schema references, union choices and JSON values. Fix the settings navigation icon.

  Add scoped Agent definition authoring, provider inspection/preflight, and retry-safe immutable registration. Make Analytics settings a management-only surface.

  Resolve unnamed MCP servers consistently between automatic definition discovery and the MCP runtime, and reject ambiguous normalized server identities.

  Explain duplicate-grain validation failures to Agent tools without exposing upstream errors, enabling repair of search-result tables that contain multiple snippets per URL.

- d55c27c: Use an empty configuration only when middleware options are omitted across tool preview, testing, execution and View runtime resolution, including previously published Assistant nodes. Preserve explicit invalid values for provider validation and keep runtime node context consistent without rewriting saved graphs.
- a6f9323: Allow signed-in Assistant sessions to start Project pipelines with live Project, Assistant and Connector permission checks, without development-only environment or Project allowlists. Preserve durable delegation requirements for resource credentials and log safe diagnostics when pipeline observation is deferred.

  Resolve saved pipeline subjects to their authorized business Workbench view through an optional subject adapter entry, so opening the business workspace stays inside Bosi and selects the associated review.

  Make pipeline cards and headers more compact, add persistent zoom and fit-to-view controls, and combine zoom with the status bar. Separate sequential steps and logical nodes into dependency-ordered columns with dedicated control headers and dividers, and place lane execution indicators at the bottom right.

- 37ae32f: Centralize GitHub App settings in system integrations, including App slug and protected credential fields. Reuse the built-in integration read permission service for signed callbacks, with tenant-only integration selection and secret-preserving partial updates.

  Add an optional integration.readConfiguration(id) capability bound to the plugin scope by the host. Validate tenant, organization and declared integration access inside the capability; system configuration resolves in the Default tenant without request context. Keep existing runtime read APIs compatible and keep PluginContext free of configuration storage details.

  Return a client validation error for invalid plugin configuration without exposing rejected configuration values.

  Add a validated, provider-independent workspace Connector command contract with optional authentication-method and system-integration constraints. Resolve capabilities from Connector declarations for both OAuth and API key methods, pin the host-owned dialog, and reject conflicting active or pending shared connections. Keep provider-specific policies and error guidance in plugins.

  Keep narrowly scoped login and plugin recovery routes reachable through their existing authentication and authorization guards when plugin version drift makes the runtime unready. Continue fencing business traffic and all new requests during shutdown drain.

  Move GitHub System Integration into the automatically loaded built-in plugin. Register its metadata and configuration handling through IntegrationStrategy, add a generic prepareConfig hook, and preserve existing integration IDs, provider keys, OAuth-only settings and saved secrets.

- Updated dependencies [c553b26]
- Updated dependencies [d55c27c]
- Updated dependencies [37ae32f]
  - @xpert-ai/contracts@3.26.1

## 3.26.0

### Patch Changes

- Updated dependencies [f0590e2]
- Updated dependencies [23b505e]
- Updated dependencies [d3ad3a5]
  - @xpert-ai/contracts@3.26.0

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.
- 1b5096f: Validate provider credentials before saving by reusing model discovery when supported, or by testing a user-selected model or endpoint. Expose an optional SDK validation policy and typed preview API, show discovered models and actionable authentication errors, and repeat validation on save without persisting the test target.
- 1cd5a33: Expose a governed REST client runtime for enabled read-only operations on existing OpenAPI connections. Reuse platform credentials and permissions, pin operation contracts, and bound JSON transport without redirects.

### Patch Changes

- 4ff6010: Use the resolved model context window consistently for primary calls and context compression. Preserve explicit provider limits and remove model-name guesses that can incorrectly reject summary input for custom endpoints.
- 8a0c256: Expose configuration tabs for existing MCP Publication plugin sources, rendered from each bound provider's `configSchema`. Preserve schema UI metadata, mask saved secrets and reject stale saves without changing ordinary toolset registration or installation.

  Allow native providers to validate connection values before persistence. Preserve array secrets by their source reference when entries are moved or removed, and reject ambiguous or mismatched references. Avoid eager tag joins when locking connection rows on PostgreSQL.

  Allow administrators to delete disabled MCP services after confirmation, clearing publication records and installation references while retaining source plugins and tools. Removing shared-service admission in an organization only removes that organization's access and records.

- Updated dependencies [3e0460d]
- Updated dependencies [babce0b]
- Updated dependencies [c2b52ba]
- Updated dependencies [ba77738]
- Updated dependencies [0f55121]
- Updated dependencies [8a0c256]
- Updated dependencies [854a4c0]
- Updated dependencies [1b5096f]
  - @xpert-ai/contracts@3.25.0

## 3.24.0

### Minor Changes

- 2e7af88: Expose McpClientRuntimeApi (platform.mcp.client) for governed access to existing MCP connections. Initially tools.list/call enforce read-only selection, current-viewer authorization, pinned schema contracts and execution limits.

## 3.23.1

### Patch Changes

- Updated dependencies [c4f9bb3]
  - @xpert-ai/contracts@3.23.0

## 3.23.0

### Minor Changes

- 616bab6: Add the SandboxWorkspaceMount contract and optional workspaceMounts provider creation option for mounts resolved after application authorization. Include conversation scope in application-side Sandbox acquisition and cache identity without forwarding business authorization context to providers.

### Patch Changes

- Updated dependencies [5afe7d1]
- Updated dependencies [94dd967]
- Updated dependencies [8ecf7b0]
- Updated dependencies [94dd967]
- Updated dependencies [616bab6]
- Updated dependencies [ddeb74f]
  - @xpert-ai/contracts@3.22.0

## 3.22.2

### Patch Changes

- 4e29238: Resolve Agent Plugin connector definitions from persisted tenant and organization configuration so catalogs, OAuth callbacks and runtime calls work across API replicas and restarts. Preserve historical connector identities and authentication methods when a native provider replaces generic MCP OAuth.

  Allow supported connectors to select or create a system integration in the connection dialog, remember its ID for reconnects, and resolve application credentials using the connection's persisted scope. Generate integration names automatically and deduplicate retries. GitHub requires the companion GitHub Connector plugin update to expose this flow and replace dynamic client registration.

- Updated dependencies [3b7f2cd]
  - @xpert-ai/contracts@3.21.3

## 3.22.1

### Patch Changes

- 558b1cd: Add provider model discovery and incremental imports for LLM, embedding, and rerank models. Preserve edited configuration across synchronization, expose model sources and editable limits, and apply the synchronized catalog to model selection and execution access.
- Updated dependencies [f60db7b]
- Updated dependencies [558b1cd]
  - @xpert-ai/contracts@3.21.2

## 3.22.0

### Minor Changes

- 795f24a: Unify managed Assistant application state under WorkspaceFilesRuntimeCapability.appData(). Resolve namespaces from loaded plugin metadata; revalidate the current actor and published Assistant on every operation. Shared workspaces remain supported unless the application requires user isolation. Reuse atomic Volume writes and shared-filesystem locks, and protect .apps from generic Files, downloads, parser inputs and sandbox file uploads. Preserve Studio draft access through explicit authoring authority.

  NsJail Runner protocol 3 masks .apps with an empty read-only mount and blocks file RPC access. Upgrade the Runner before the API; older Runners fail closed. Local Shell is trusted development execution and does not provide OS isolation. No old application data is migrated.

  Pin application handles to their original workspace, and reject private file projections after a switch to shared storage. Renew lock leases only after successful filesystem heartbeats, verify lock ownership before mutations, and preserve replacement owners on release. Reject root aliases into managed data and protect managed descendants during recursive deletion.

### Patch Changes

- a2e5e2c: Check required permissions by membership instead of counting matching role records. Duplicate enabled grants no longer deny Project catalogs or substitute for a different missing permission. Apply the same behavior to the server and Plugin SDK request contexts.
- 672810f: Preserve authorized MCP App results after interactive sessions expire and allow explicit recovery without rerunning the original tool. Recheck current message, Assistant and connector access, prevent stale replicas from replacing renewed sessions, and remove saved history with its owning conversation or messages.

  Expose a server-only View middleware runtime capability so plugins can reuse authorized Assistant configuration and connector bindings without inventing an Agent execution. Redact session credentials from HTTP request URLs and query logs.

  When TypeORM schema synchronization is disabled, apply `packages/server-ai/src/mcp-app-runtime/migrations/20261012-mcp-app-history.sql` before deploying the history and recovery endpoints.

- Updated dependencies [e42fc94]
- Updated dependencies [7de8eae]
- Updated dependencies [f304e7b]
- Updated dependencies [d9db433]
- Updated dependencies [f816d25]
  - @xpert-ai/contracts@3.21.1

## 3.21.1

### Patch Changes

- ae1fb5f: Add scoped knowledgebase discovery, readiness and action-permission APIs with authorization-aware cursor pagination. Preserve the legacy list behavior with deprecation guidance, and fail indexing when supplied generated-image semantics are invalid instead of indexing placeholder content.

  Clarify runtime and provisioning API responsibilities, and organize the SDK guides into English documentation with updated navigation, branding, package assets and cross-references.
