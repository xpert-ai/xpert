# @xpert-ai/xpert-api

## 3.29.1

### Patch Changes

- ccc040b: Disable Assistant maxConcurrency customization and omit it from LangGraph execution. Retain the deprecated type field for plugin and external-template compatibility, accepting it without errors and silently ignoring it. Remove it from built-in templates and strip legacy values when saving drafts or publishing Assistants. Resolve approval tool calls by checkpoint identity across trailing tool results and repeated tool names, and distinguish unfinished work from approval stops.
- a870de9: Authorize managed model execution for the exact published channel Assistant while preserving the technical actor and resolving billing through existing ModelAccess rules. Freeze and revalidate the payer, aggregate payer-wide limits, preserve source ownership and usage attribution, and restore the scoped identity in background invocation recovery.

  Route conversation environment file access through a host-owned authorization policy. Keep ordinary isolated volumes and Project precedence, and deny shared group environments unless the installed host authorizes their live binding. The open-source platform remains independent of Computer and Docker implementations.

- a870de9: Allow channel plugins to supply stable chat source identifiers through the shared TChatFrom and RunSource contracts without adding each provider to the platform's literal list. Accept nonempty producer identifiers in handoff routing configuration while preserving exact source, tenant, and organization matching. Keep legacy source values and persisted conversation attribution unchanged, and let the agent chat dispatch contract inherit the shared source type. Existing channel plugins require no payload migration; new plugins need the updated contracts when compiling. Source attribution remains separate from execution identity and authorization.
- 1b736d9: Do not expose unresolved saved model references as selectable provider models after rename or deletion. Preserve historical selections for explicit reselection, show an unavailable-model warning, and prevent saving an unavailable default model. Existing model-access revocation semantics are unchanged.
- 1f1c7b7: Explain unavailable plugin marketplace details without assuming that a package is nonexistent or private. Preserve structured lookup errors, localize access and availability guidance in English and Chinese, and offer retry for transient failures while keeping navigation back to the marketplace available.
- 5449238: Reset generation parameters when changing model identities while retaining client retries and same-model overrides. Preserve numeric input drafts and commit edits before saving. Persist explicitly cleared optional parameters without restoring defaults or sending them in provider requests, including ModelExecution snapshots and native protocols.

## 3.29.0

### Minor Changes

- 78cd9c0: Add revocable, expiring conversation text snapshots with organization membership checks, opt-in public links, a full-width Cloud viewer using ChatKit's read-only message list, preview validation, and bearer-token log protection. Project and group conversations cannot be exported. The shared renderer receives only authorized text and theme data, without live conversation credentials.

  Add a personal shared-links settings dialog with search, pagination, owner-only snapshot previews, and confirmed single/bulk revocation. Management excludes delegated Assistant credentials and preserves conversations and shares created after the reviewed cutoff.

  Persist conversation exports through existing Artifact containers, immutable ArtifactVersions and revocable ArtifactLinks. Reopening and copying reuse the stored URL. Enforce conversation source availability and export restrictions on shared Artifact content entrypoints, including raw URLs. No separate ConversationShare entity or token-recovery migration is introduced.

  Keep conversation rules in conversation-sharing as a built-in Artifact type plugin with Artifact-owned share queries. The conversation feature module registers its type and host view directly, without a separate built-in plugin aggregation module. Register through the SDK type protocol, persist the installation binding, and reject unavailable types without fallback. The former host-only source-policy interface is removed.

  Use the existing CLIENT_BASE_URL for share and management URLs, exposed through the shared clientBaseUrl bootstrap setting. Conversation sharing requires no feature-specific deployment configuration. Public sharing is available by default but still requires explicit owner confirmation; the default audience remains organization-only with a seven-day expiry.

### Patch Changes

- 4ee32d7: Allow all validated opaque content revisions to be persisted and isolate collaboration state encoding helpers.
- a58eb21: Build the execution observability plugin after its workspace dependencies so clean API image builds can resolve the contracts and plugin SDK declarations.
- 13812af: Include the execution observability plugin manifest in the API Docker dependency stages so workspace dependencies match the committed build and production locks.
- c4c344f: Build Artifact Library URLs from the effective frontend configuration so bootstrap overrides point users to the configured host.
- 4b07221: Add the built-in administrator execution-observability plugin with an expandable Assistant/conversation timeline and five read-only analysis tools. Reuse scoped existing execution and usage records, preserve unknown lifecycle phases and costs, and ship shared shadcn/Tailwind remote assets without new tables.
- b459105: Preserve new messages sent after interrupted tool runs by checkpointing input identities and committing their consumption with model history. Keep new Send, checkpoint Resume/Retry, and tool/model loops distinct; preserve completed tool results and record unknown outcomes for missing results without rerunning old tools. Add graph-level regression coverage for interruption, repeated input text, recovery, middleware, and delegated input scope.
- 2e717f0: Allow provider-declared native Responses by default for delegated model execution so Codex retains configured reasoning effort instead of entering the limited Chat bridge. Preserve explicit tenant protocol restrictions and require a new execution for the updated protocol selection.
- 3b03ad7: Delegate scoped database workbench discovery and location handling to registered plugins. Preserve actor authorization, source revision checks and independent connection cleanup without a built-in engine allowlist.

  Breaking SDK change: remove the legacy SQL adapter, dialect validation and quoting exports. Database plugins now own these implementations; SQL consumers migrate to the plugin-repository sql-workbench helpers. Strategies explicitly declare workbench support and runners accept the requested DatabaseLocation. Upgrade the MySQL/Doris, PostgreSQL, HANA and DB Studio plugins together with this SDK; old plugins without the registration opt-in are unavailable to the scoped workbench until upgraded.

- 2aae0fa: Expand the catalog revision column in place before entity synchronization, preserving existing provider revisions during upgrades.

## 3.28.0

### Minor Changes

- 7535029: Support automatic Agent runtime bindings across Computer, SDK, process and external service transports. Preserve existing execution protocols and interactive approvals while removing user profile/binding forms. Derive authorization from the current actor and Assistant, and resolve launch settings from installed strategies through a scoped capability, without a host runtime inventory. Old configuration is not migrated or reused.
- f9b312a: Release the Project content catalog, compatible resource editor discovery, and durable resource lifecycle recovery in the API and Web applications. Deploy the matching contracts, plugin SDK, ChatKit, and resource plugins together, and apply the content operations schema migration before starting the maintenance worker.

### Patch Changes

- 7535029: Include the JavaScript-only desktop protocol workspace package at the production runtime root so externalized API imports resolve after a production-only installation.
- 4995ec0: Publish the shared Computer Codex isolation-policy contract, launch-conflict and environment-unavailable errors, and matching metric events. Update bundled cloud-coding guidance and Codex profile revision 7 to inherit the host policy and distinguish model availability from command readiness.

  The managed Computer launcher, command preflight and seccomp changes are implemented and released by Xpert Pro; this shared-package update alone does not add those runtime capabilities to an OSS installation.

- 9585d4e: Persist compatibility chat output in Redis and scoped display snapshots so ChatKit can rejoin an active run. Establish the execution lease before graph execution and bind replay identifiers to the admitted conversation and run.
- 9585d4e: Resolve custom native model capabilities and credentials from the authorized provider model record. Pass the selected model's reasoning effort to Codex, accept namespaces containing only client-executed Responses tools, preserve budget callbacks across separate LangChain module copies, and report sanitized native transport diagnostics.
- 1c7c7dc: Preserve validated, non-secret Assistant model parameters through delegated execution grants and model construction. Apply supported request overrides before provider defaults, normalize output-token aliases, and retain host-owned retry and authorization controls. Map native protocol settings explicitly and reject incompatible parameters instead of silently dropping them.
- 6bf0f31: Add authenticated single-request View image previews with bounded WebP thumbnails, current resource and Assistant authorization on every read, versioned byte caching, and group runtime scope validation. Keep the existing grant routes for other file uses.
- 22025b3: Exclude unrelated deleted document records when moving a replacement at the same
  path. Preserve explicit document restores and folder restores using the document
  identities and epochs captured by the accepted deletion operation.
- 15e3ad0: Preserve durable MCP control delivery and checkpoint tool identity across replicas and input continuation. Keep task receipts separate from business output, complete official recovery migrations, and verify the full Assistant/Pipeline-to-Sandbox chain with independent processes and storage.

  Require actual AssistantTask settlement evidence before Pipeline cancellation completes, and register the control entities in the official schema catalog.

- d7dee1d: Allow explicitly reviewed legacy database column variants during baseline adoption without rewriting historical migration checksums. Preserve stronger Pipeline nullability and timestamp semantics while continuing to reject missing constraints and inconsistent execution evidence.
- 76656ca: Reduce thread capability read overhead by loading only the published graph and execution settings needed for recovery validation, without expanding workflow collection relations. Preserve runtime access checks, graph revision compatibility, and complete retry checkpoint validation.
- b3bcdfe: Run database apply and verify commands after building and before every local API
  startup or source restart, including development and debug entrypoints. Stop on
  failed upgrades, retain explicit baseline adoption, and terminate child processes
  when restarting.
- b21c640: Persist MCP execution ownership before sending work, redeliver original-generation control and retain settlement until handlers and attached work actually finish. Add a negotiated control receipt, unique task admission, non-replaying input continuation, and conversation pause/termination bridges. Include conservative migration for legacy tasks.
- 4820bf3: Add pinned runtime host/generation targets, descendant completion evidence, original-host control compensation, and a shared process supervisor. Legacy receipts remain unconfirmed; unsupported supervision cannot release controlled work.
- 5d46f25: Preserve the authenticated ChatKit audience while dispatching an authorized external Assistant from a background task. Revalidate live access, scope delegation through stream subscription, and report the actual executor and startup error for task reconciliation.
- 4a22aea: Reconcile persisted plugin restart failures against the current server generation, retain operation identities across failures, and isolate browser state by authenticated scope. Fence restart publication atomically so stale tabs cannot replace newer desired plugin versions. Preserve exact runtime admission checks and server-owned setup activation.

  Separate browser persistence, schema validation, and restart reconciliation policy. Report invalid or unavailable storage explicitly, preserve in-memory state when persistence fails, and verify scoped records before removing legacy cache entries during migration.

- 22025b3: Fix downloads in the task results and coding execution views when the host returns
  authorized file bytes as a data URL. Download those bytes as an iframe-owned
  attachment, retain HTTP grant support and reject unsafe or malformed URLs.
- c08868e: Avoid repeated ancestor and execution scans during data-retention previews. Resolve protected checkpoint IDs once and reuse candidate eligibility for totals and the selected batch, preserving cleanup protections, scope matching, and execution-time rechecks.
- 8741bfe: Report old/new argument line counts and actual file additions/deletions after sandbox edits. Compute line differences in the existing sandbox process without Git or temporary files, with bounded comparison work for broad rewrites. Unchanged replacements succeed with a zero diff. Sequential batches retain per-edit feedback and partial progress; unavailable statistics never prevent editing.
- 47c4d17: Bind Sandbox jobs and host callbacks to durable execution generations. Redeliver original-target control, retain capacity until runtime and attached work actually settle, prevent implicit replay, and support explicit retries of settled generations. Add provider evidence and conservative legacy migration.
- a520041: Run registry plugin installation asynchronously with bounded execution and process-group cleanup. Serialize shared-store mutations across API replicas, validate legacy installations, publish complete artifacts and manifests atomically, and propagate staging failures before runtime activation. Keep admission deadlines and restart capacity checks intact; verify slow installations overlapping rolling restarts through readiness-aware ingress.
- 59d850d: Search each sidebar panel's own authorized business data, with independent queries, grouped results, pagination, loading/error states, and cancellation when the query, account, or organization changes. Cover Bosi automations and conversations, Assistant views and archived conversations, accessible projects/workspaces, plugins, configured model catalogs, MCP services/runtimes, evolution records, approvals and settings navigation. Open results at their matching business destination while preserving the existing Settings layout.

  Add validated, scoped conversation-title search before pagination; preserve owner, tenant, organization, Assistant, private-conversation and archive restrictions, and escape SQL wildcard characters.

  Apply literal, paginated search to evolution target names, learning summaries, candidate versions, evaluations and deployments; retain existing strategy, mechanism and organization restrictions.

- a724133: Expose a versioned public thread control view backed by durable execution evidence. Keep accepted cancellation pending until owned work settles, gate recovery/input actions, and whitelist public run-control fields.

## 3.27.0

### Patch Changes

- 52a3241: Let Assistant capability providers explicitly opt into parameter-free creation switches through supportsQuickCreation. Cloud discovers these options from the server instead of hardcoding Project management, so Spaces and future plugins can participate without bespoke UI. Preserve model authorization, existing capabilities and revision-checked composition; apply and save all selected capabilities before publication.
- 33313f8: Reduce project-task polling work with a scoped run-status endpoint that selects lifecycle fields and business outcomes without loading execution payloads. Limit task-graph execution queries to timing and status fields.

  Pause project-task refreshes while their Workbench view or browser tab is hidden and resume when visible. Deduplicate avatars by content version and omit assets already cached by the client, preserving task state, access checks, and retry behavior.

- 147683a: Preserve reasoning and cache token details in priced LLM receipts so Model Gateway can validate and settle reasoning-model calls. Keep usage with unavailable or inconsistent pricing pending settlement instead of treating it as a successful zero-point charge. Add regression coverage from the SDK callback through gateway validation and idempotent membership ledger settlement.
- d6efa08: Keep API startup available when an external plugin pipeline contribution fails contract validation, including legacy templates that omit projectTypes. Isolate constructor and discovery validation failures, exclude invalid contributions from the catalog, and report scoped diagnostics without payload values. Preserve strict explicit registration, built-in validation, dependency injection and non-validation errors.
- 078e6fe: Allow trusted Artifact document hosts to opt into exact HTTPS origins for scripts, styles, fonts and images while preserving the offline default and blocking direct data requests, frames, workers and eval. Share resource checks between preview routing and the document CSP.

  Preserve safe analytics error codes, failure stages, retryability and localized repair guidance in both HTTP responses and Agent tool errors. Distinguish read-only SQL rejection, parameter binding failures and output contract mismatches without exposing private provider errors. Add browser isolation coverage and regression cases for parameterized Doris month filters.

- 1aac9eb: Preserve existing toolset bindings when refreshing Assistant templates in workspaces with multiple instances of the same provider. Validate the bound toolset against the current organization and workspace, while retaining ambiguity checks for new installations and rejecting unavailable bindings. Isolate toolset dependency inspection in a dedicated method.
- 19dcf40: Preserve thread activity SSE updates when Nest has already flushed response headers, while retaining sanitized diagnostics for failed reads.
- c3509ee: Expose `ProjectAssistantBinding` and return `assistantBindings` from managed Project provisioning so native pipeline applications can bind role executors by plugin, template and agent identity. These are resolved role requirements; `xpertIds` remains the Project membership list.
- 240a5fe: Declare Project authorization as an explicit dependency of workspace file access,
  and preserve tenant-shared Assistants after the authenticated actor passes the
  published catalog authorization checks.
- de45823: Keep document source contracts browser-safe and include their transitive types in
  the isolated Cloud build. Register durable display snapshots and conversation
  revisions in the packaged SQL migration flow so clean databases initialize in
  dependency order and existing deployments receive the required fields.

## 3.26.2

### Patch Changes

- 2e052d5: Expose current-request platform permissions without role-administration access,
  preserving live grants, JWT permission ceilings and tenant/organization isolation.

  Support explicit authentication strategies on controllers and routes. The current
  permissions endpoint requires JWT, while unannotated routes retain the open-source
  server's JWT/Basic defaults. Reject anonymous, Basic and API-key credentials on
  the permissions endpoint without marking it public or authenticating twice.

- d80b159: Include Poppler and validate LibreOffice, fonts and two-page UTF-8 extraction before document preview execution. Add the isolated LibreOffice NsJail binding and retain dependency, conversion, extraction and timeout diagnostics. Publish a new Runtime Suite artifact and regenerate production digest bindings through the release workflow; existing production locks are not changed by this source fix.
- b743428: Attribute providers and controllers returned by a plugin's dynamic `register()` module to their plugin scope and version before discovery. This lets Data Xpert verify managed middleware readiness instead of seeing those providers as built-in. Skip primitive provider values and string aliases when attaching reflection metadata.
- 0bcd7a7: Prevent independent background Assistant tasks from inheriting the caller's workspace storage lock leases during execution creation and subscription. Preserve authorization and invocation context, idempotent dispatch, and stale-owner fencing so tasks can read and save results after the caller releases its lock.
- c59009d: Add a built-in NsJail Compute Runtime Provider so open-source deployments can run Python and JavaScript Workspace Script Actions without a Pro Runtime Provider. The Runner includes the pinned Compute rootfs and a separate authenticated, offline Jobs protocol with read-only inputs, bounded scratch storage, cgroup v2 resource limits, streamed host invocations and deterministic cleanup. Update both API and Runner together; Compute remains unavailable on older Runners or without cgroup v2 isolation.
- 06be3c0: Provide hardened open-source NsJail bindings for AnyDoc and OpenDataLoader document Jobs, with locked native/Java/OCR dependencies, isolated profile lifecycles and real image acceptance checks. Correct document Artifact catalog families and validate release metadata. Deploy the matching API and Runner together; existing Runners fail document readiness closed.
- 389933d: Require pipeline templates to declare their supported application and project types. Filter the configuration catalog and enforce the persisted project type when saving configurations and starting runs, so templates cannot execute in unrelated projects.

  Upgrade pipeline contributions together with the host and create compatible configurations for typed projects; legacy definitions without an explicit project type are not implicitly accepted. Preserve runtime scope in the remote-view preview host for realistic plugin verification.

  This release intentionally remains on the 3.x patch line. Before upgrading, add
  explicit `projectTypes` declarations to existing pipeline contributions and saved
  templates. Older templates are rejected; no compatibility fallback is provided.

- 32d695d: Withdraw API replicas from readiness-aware ingress before draining, refresh plugin admission independently of rollout bookkeeping, and expose validation and lease diagnostics. Preserve structured runtime errors in Desktop with bounded recovery for safe requests and clear recovered session errors. Compose deployments must route all API ingress through the new readiness-aware gateway.

  Give admission monitoring an independent provider lifecycle, validate a configurable ingress propagation budget, and distinguish runtime completion from ingress acknowledgement.

  Keep authenticated readiness independent of tenant settings, bound Redis cache reads and writes with database fallback, and stop queuing cache calls while timed-out operations remain pending.

- c59009d: Preserve known Sandbox Runtime dependency error codes across the Analytics boundary with safe, localized remediation and retry policy. Keep arbitrary plugin HTTP errors, messages and execution details redacted.

  Allow targeted Runtime family publication without npm publication or rebuilding already published families, and verify the full API manifest contract before image promotion.

  Report invalid Action script inputs separately from Runtime startup failures, with fixed guidance about the Workspace script entrypoint and standard-library contract. Runner output remains private.

## 3.26.1

### Patch Changes

- c553b26: Introduce one canonical Analytics source model and runtime for database connections, versioned Definitions and Artifacts. Add scoped configuration management and settings UI, and restrict DataSource Types to real database drivers. Remove versioned protocol adapters and migration inventory. Analytics plugins and saved documents must use the canonical source envelope; this release intentionally does not decode historical Bindings.

  Use the shared JSON Schema form and Zard controls for Analytics settings, including nested schema references, union choices and JSON values. Fix the settings navigation icon.

  Add scoped Agent definition authoring, provider inspection/preflight, and retry-safe immutable registration. Make Analytics settings a management-only surface.

  Resolve unnamed MCP servers consistently between automatic definition discovery and the MCP runtime, and reject ambiguous normalized server identities.

  Explain duplicate-grain validation failures to Agent tools without exposing upstream errors, enabling repair of search-result tables that contain multiple snippets per URL.

- f15330e: Refresh the coordinated ChatKit package locks to the latest compatible published patches. Align transitive-only ChatKit dependencies in Desktop with the selected versions while preserving the workspace's dependency and override policies.
- 80b5c53: Rebuild the API image with the updated Codex profile revision and bundled cloud-coding
  instructions that inherit the host's permission policy and preserve explicit restricted modes.
- 4d2e927: Correct invalid GraphRAG identity model responses once before failing the document job, preserving strict candidate validation and saved extraction reuse.
- 32bb151: Fix Linux template file initialization by reusing validated directory handles during create-only writes. Preserve existing files, directory containment, and rejection of untrusted symlinks.
- 2984151: Show the explicit Project tasks capability label in Studio middleware settings before falling back to linked view titles. Preserve runtime activation, navigation and access checks for task results and coding execution views.
- d55c27c: Use an empty configuration only when middleware options are omitted across tool preview, testing, execution and View runtime resolution, including previously published Assistant nodes. Preserve explicit invalid values for provider validation and keep runtime node context consistent without rewriting saved graphs.
- a6f9323: Allow signed-in Assistant sessions to start Project pipelines with live Project, Assistant and Connector permission checks, without development-only environment or Project allowlists. Preserve durable delegation requirements for resource credentials and log safe diagnostics when pipeline observation is deferred.

  Resolve saved pipeline subjects to their authorized business Workbench view through an optional subject adapter entry, so opening the business workspace stays inside Bosi and selects the associated review.

  Make pipeline cards and headers more compact, add persistent zoom and fit-to-view controls, and combine zoom with the status bar. Separate sequential steps and logical nodes into dependency-ordered columns with dedicated control headers and dividers, and place lane execution indicators at the bottom right.

- 2bdca1e: Align the active Project tasks tab underline with the navigation bar's bottom border by removing the tab list inset and making tab buttons fill its height.
- 12b72ad: Keep schema-sync available when individual plugins fail to load, retaining successful plugin entities and existing tables for unavailable plugins. Continue to stop deployment on plugin discovery failures, startup timeouts, invalid entity metadata and database migration errors.
- 37ae32f: Centralize GitHub App settings in system integrations, including App slug and protected credential fields. Reuse the built-in integration read permission service for signed callbacks, with tenant-only integration selection and secret-preserving partial updates.

  Add an optional integration.readConfiguration(id) capability bound to the plugin scope by the host. Validate tenant, organization and declared integration access inside the capability; system configuration resolves in the Default tenant without request context. Keep existing runtime read APIs compatible and keep PluginContext free of configuration storage details.

  Return a client validation error for invalid plugin configuration without exposing rejected configuration values.

  Add a validated, provider-independent workspace Connector command contract with optional authentication-method and system-integration constraints. Resolve capabilities from Connector declarations for both OAuth and API key methods, pin the host-owned dialog, and reject conflicting active or pending shared connections. Keep provider-specific policies and error guidance in plugins.

  Keep narrowly scoped login and plugin recovery routes reachable through their existing authentication and authorization guards when plugin version drift makes the runtime unready. Continue fencing business traffic and all new requests during shutdown drain.

  Move GitHub System Integration into the automatically loaded built-in plugin. Register its metadata and configuration handling through IntegrationStrategy, add a generic prepareConfig hook, and preserve existing integration IDs, provider keys, OAuth-only settings and saved secrets.

## 3.26.0

### Minor Changes

- 23b505e: Allow side chats to fork the latest sealed assistant reply while the source keeps running. Validate and copy pinned root, subgraph and ancestor checkpoints without pending work or live Goals. Reuse the created thread when a request is retried after the source advances.

  Expose the same behavior from Conversation Map and return a localized explanation when no sealed reply is available. Keep bodyless legacy copies idle-only and preserve historical input editing. Shared checkpoint references remain a separate, unimplemented architecture proposal.

### Patch Changes

- f0590e2: Upgrade ChatKit dependencies to 0.17.0, including the UI's Xpert SDK 0.15.0 dependency, and align workspace, API, Web and Desktop lockfiles.
- c9027ea: Prevent new-version Assistant publication from cascading a version-number update into its primary Agent and falsely reporting AgentOutdated when the Agent inherits its model. Preserve stale-Agent checks, transactional version backups and rollback, and cover these paths with PostgreSQL regression tests.
- 138821f: Allow Assistant templates to select an authorized language model without requiring a Primary configuration. Resolve existing bindings and eligible defaults from the governed model catalog, preserve model options, and revalidate access before installation.
- 629d5fa: Preserve the current organization when initializing MCP services and connections from tenant-installed plugins. Keep organization instance state and synchronization scoped to that organization.
- d3ad3a5: Refresh the Cloud assistant sidebar after successful template installation. Preserve installation history while reporting current target availability, disable opening deleted or inaccessible assistants in Cloud and Desktop, and clear stale opening errors when starting another installation. Keep interrupted-request recovery and idempotency intact.
- 54778dc: Extend the existing schema-sync deployment job with TypeORM SQL migrations. Ordinary tables still synchronize from entities; explicitly SQL-managed tables are excluded. Package module-local SQL and checks, preserve migration checksums, support verified baseline adoption, and serialize host/plugin DDL using a shared PostgreSQL lock.

  Disable API startup DDL in development as well as production. Share installed plugin mounts with Compose migration jobs and fail on incomplete plugin registration. Preserve legitimate undispatched ModelExecution calls during baseline adoption, with regression coverage for independently reconstructed legacy databases.

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.

### Patch Changes

- 00001bc: Initialize the disposable API acceptance database with schema synchronization and Project Pipeline SQL migrations before starting in external schema mode. Preserve sanitized startup failures, dependency logs and container health probe results in CI.
- babce0b: Return typed errors for disallowed or unavailable Assistant model selections. Preserve failed execution and thread error details while releasing the run claim after admission rejection.
- c2b52ba: Include Assistant runtime dependency compatibility in application releases. Ordinary plugin updates produce non-blocking recommendations while unavailable dependencies and explicit version requirements retain actionable runtime errors.
- ba77738: Allow compatible ChatKit patches within the current minor line and provide an explicit dependency refresh command that keeps workspace and deployment locks aligned. Docker builds continue to use frozen locks.
- 6496fd3: Stop restoring checkpoint values for ordinary thread reads so opening conversations and polling run control do not block the API on large saved states. The existing thread route retains metadata and control fields; callers that need execution values must use the explicit thread state route.

  Return a localized 404 when the state route cannot find the latest or requested checkpoint, while preserving access checks and allowing ordinary metadata reads for threads without saved state.

- 4ff6010: Use the resolved model context window consistently for primary calls and context compression. Preserve explicit provider limits and remove model-name guesses that can incorrectly reject summary input for custom endpoints.
- 0f55121: Ship the shared legacy model capability conversion fix in application images. Preserve explicitly configured streaming tool calls and the authority of newer model features while keeping multi-tool-call support a separate explicit declaration.
- 8a0c256: Expose configuration tabs for existing MCP Publication plugin sources, rendered from each bound provider's `configSchema`. Preserve schema UI metadata, mask saved secrets and reject stale saves without changing ordinary toolset registration or installation.

  Allow native providers to validate connection values before persistence. Preserve array secrets by their source reference when entries are moved or removed, and reject ambiguous or mismatched references. Avoid eager tag joins when locking connection rows on PostgreSQL.

  Allow administrators to delete disabled MCP services after confirmation, clearing publication records and installation references while retaining source plugins and tools. Removing shared-service admission in an organization only removes that organization's access and records.

- 27fab44: Resume pending plugin rollouts when API capacity recovers, preserve last-replica outage approval and generation fencing, and keep the plugin settings page tracking waiting releases until completion.
- 854a4c0: Include the Project type business-task concurrency policy in application releases,
  allowing business applications to declare their task capacity through the Project
  type catalog.
- 1b5096f: Validate provider credentials before saving by reusing model discovery when supported, or by testing a user-selected model or endpoint. Expose an optional SDK validation policy and typed preview API, show discovered models and actionable authentication errors, and repeat validation on save without persisting the test target.
- 1cd5a33: Expose a governed REST client runtime for enabled read-only operations on existing OpenAPI connections. Reuse platform credentials and permissions, pin operation contracts, and bound JSON transport without redirects.
- d59c8e5: Share MCP client authorization context assembly so client factories preserve execution identity when resolving Connector credentials without changing access checks.
- 2aada62: Include runtime entities in standalone schema synchronization so externally managed fresh databases contain Sandbox jobs and managed services, invocation and delivery records, and the other entities already registered by runtime feature modules.

## 3.22.1

### Patch Changes

- 2e7af88: Include the shared MCP Client Runtime SDK capability in application releases. The API provides governed read-only tool discovery and calls using existing connections, current-viewer authorization and pinned schema contracts.

## 3.22.0

### Minor Changes

- c4f9bb3: Add organization member sharing and scoped user-group authorization for Assistants. Separate resource sharing from organization group management, enforce active organization membership and runtime-only grants, and keep access changes consistent across published versions.

  Use the existing Zard UI theme for the sharing page and hide group authorization when the account cannot view organization user groups.

### Patch Changes

- 7591451: Reuse compiled workspace libraries for API bundling and type checking. Build API, plugins and remote UI through one dependency graph with bounded concurrency, retain compatible UI commands, and record task/compiler timings for reproducible Docker build comparisons.
- fc76e54: Speed up API image builds with registry caching, an independent Debian production-dependency layer, and removal of the redundant standalone remote-component build. Honor the configured build heap limit while preserving frozen locks, native-module checks, and verified-image publication.
- 02345e3: Upgrade all shared ChatKit packages to 0.16.0 and align workspace, API, Web, and Desktop dependency locks. Include floating Workbench chat, image reference thumbnails, and the latest message interaction and workspace preview improvements.
- 2e488be: Manage data retention exclusively from the default tenant and apply its cleanup switches and retention periods to all tenants. Ignore other tenants' previous retention overrides, preserve conversation references and pending settlements, and retain model usage facts when removing expired call records. Only default-tenant SuperAdmins can change these global policies; missing or disabled default policies do not trigger cleanup.

  Keep retention parameters out of the generic tenant settings editor and only display saved changes after the request succeeds. Failed saves preserve the original value and editable draft and show an error.

- e91caec: Clarify that Assistant final replies are posted directly to the group and should address its members, with a brief closing remark or new information after a tool-sent message instead of a repeated execution report. Preserve the existing message publication behavior.
- 55ddc1f: Synchronize human group invitations with membership in the group's bound Project in one transaction. Preserve existing Project roles, restore removed users as ordinary members, and retain Project management and organization access checks.
- 3cb19b9: Project group message delivery as consumed once the exact input is accepted by the Assistant runtime, without waiting for a reply or changing dispatch recovery state. Refresh group streams when consumption changes and keep queued steer inputs unacknowledged until consumed.
- a0fc95e: Authorize native Workbench file operations for active group members through the persisted group/Assistant runtime binding. Recheck credential audience, tenant and organization scope, expiry and live membership on each file request, retaining Assistant file and Project write authorization and ordinary conversation isolation.

  Deny non-Project group runtime environment file access until a live environment sharing policy can authorize the exact binding and owner; a persisted sandbox environment reference alone does not grant file access.

- bb2b948: Keep rolling plugin updates available when replacement replicas load a later published plugin manifest during a bulk update. Use the same exact manifest for readiness and rollout completion while preserving queued convergence and healthy replica capacity.

## 3.21.6

### Patch Changes

- 1a6452e: Resolve application covers centrally: prefer app presentation screenshots, inherit marketplace screenshots when absent, and preserve explicit empty arrays. Apply the same manifest-declared bundle path, image format, size and symlink boundaries to both sources.

## 3.21.5

### Patch Changes

- 5afe7d1: Add the optional package-level Agent Plugin role: capability, assistant, or subagent. Hide only assistant-role packages from ChatKit discovery while keeping all valid templates in the Assistant marketplace.

  Support selection-purpose catalog reads so existing conversations retain resource metadata and pinned references. Role changes do not revoke execution access or alter template dependencies. Deploy this API before the matching ChatKit update and import role-bearing packages only after upgrading the parser.

- 94dd967: Add background Agent plugin updates from a selected Git branch and a preview for cleaning unused old versions. Preserve existing Assistant and conversation references, configured versions, and disabled state. Reimports verify and repair missing or damaged files without changing package or binding identities. Retired files use a durable cleanup queue so failures can be retried safely.

  Existing SQL-managed databases must apply the included Agent plugin maintenance migration before deployment; existing bindings remain protected by default.

  Reuse locked database connections for template reference reservations and background maintenance work so concurrent requests cannot starve their lock holders of a connection.

- 8ecf7b0: Expose non-assistant-role package templates as conversation sub-agent capabilities. Preserve package selection and existing skills/MCP tools while adding one lazy delegation tool per template.

  Execute authorized template snapshots through the native Agent invocation runtime without installing or publishing Assistants. Pin dependency/model configuration, isolate task state, files and onboarding, and preserve checkpoint approvals, cancellation and execution ownership. Assistant-only packages and the template marketplace retain their existing behavior.

  Revalidate published Assistant access or Project membership and Assistant binding before invocation, replay and task initialization. Reject revoked access and changed package snapshots before resolving dependencies or writing task files.

  Deploy with the matching SDK and ChatKit template-component changes. Runtime dependencies and shared connections must already be configured; delegation does not install dependencies or schedule template routines.

- ddeb74f: Upgrade the shared ChatKit catalog to 0.15.0 and align workspace and deployment locks. Deliver selected-plugin skill command shortcuts, descriptive subcommand labels, theme-aware code blocks, and concise external Assistant messages alongside the authorized command execution and template sub-agent Sandbox provider fixes.
- 616bab6: Allow automatic context compression during long tasks at complete tool cycle boundaries. Preserve the current user request, recent and in-flight tool calls, and matching tool results so compressed histories remain valid. Keep manual compression at whole-turn boundaries.
- 94dd967: Run one-click official Agent plugin imports as background jobs so large catalogs no longer keep a single HTTP request open. Persist progress per tenant and organization, show incremental results, and resume the same Git snapshot after page reloads or API restarts without repeating completed imports. Duplicate requests reuse the running job, and partial package failures remain visible.
- 1a60257: Include published Agents from organization-shared workspaces in group invitation candidates while preserving tenant, organization, group-owner, and authoring permission boundaries. Show only the latest Agent versions and exclude active group members, including other versions of an Agent already in the group, before pagination.

  Apply stable database pagination and let Desktop load all candidate pages. The API keeps its array response and accepts optional limit and offset parameters; the ChatKit load-more interface requires the matching SDK and ChatKit releases.

- 616bab6: Add an optional group identifier to the Workbench runtime scope and resolve group views through the authorized group context API. Keep views bound to the resolved Assistant and conversation, ignore stale responses when switching groups, and avoid falling back to personal views while group context is loading.
- 4bf9514: Allow integrations without a registered strategy, including GitHub, to be updated and deleted. Reuse the existing scoped registry lookup for optional validation and lifecycle hooks, while preserving lookup errors and failures from registered hooks. Required strategy operations remain unchanged.
- 616bab6: Resolve published Assistant environments through runtime authorization so users allowed to run an Assistant can use its configured environment without authoring workspace access. Draft execution retains authoring access checks.
- 616bab6: Add the SandboxWorkspaceMount contract and optional workspaceMounts provider creation option for mounts resolved after application authorization. Include conversation scope in application-side Sandbox acquisition and cache identity without forwarding business authorization context to providers.

## 3.21.4

### Patch Changes

- 4e29238: Resolve Agent Plugin connector definitions from persisted tenant and organization configuration so catalogs, OAuth callbacks and runtime calls work across API replicas and restarts. Preserve historical connector identities and authentication methods when a native provider replaces generic MCP OAuth.

  Allow supported connectors to select or create a system integration in the connection dialog, remember its ID for reconnects, and resolve application credentials using the connection's persisted scope. Generate integration names automatically and deduplicate retries. GitHub requires the companion GitHub Connector plugin update to expose this flow and replace dynamic client registration.

- ab15014: Fix Conversation Map validation errors when newly created conversations do not yet have a title, with a consistent fallback for missing or blank titles.

  In tree mode, combine uninterrupted message paths into summary nodes and split them at actual message forks. Show only the latest human question and a short AI reply, and open the actual conversation history for message details and individual message actions. Read lightweight ancestry metadata and batch only the message bodies needed for summaries instead of loading complete histories for every branch. Preserve relation graph, list, and search behavior.

- 3b7f2cd: Extend the existing api_key table and authentication flow with USER-bound personal keys in account settings, with one-time secret display, hashed storage, expiration and revocation. Use the same endpoints and authentication flow as existing API keys, restoring the personal key's human owner and current permissions. Preserve ordinary login-only management endpoints and the existing resource-key and ChatKit session flows; no personal-key-specific route opt-in is required.

  Instances that tested the separate-table draft can preserve those credentials with the one-time `packages/server/src/api-key/personal-api-key/migrate-personal-api-keys.sql` script after schema synchronization.

- 2f25689: Distinguish validated view host types and view keys in HTTP request metric routes so Grafana can rank individual views. Keep host IDs and query values out of metric labels, and preserve generic route templates for unresolved or unauthorized views.

## 3.21.3

### Patch Changes

- f60db7b: Exclude expired and unready replica registrations from plugin rollouts, validate returning replicas before admitting traffic, and restart one candidate at a time. Preserve healthy peers on failure, add bounded plugin startup diagnostics and an event-loop-independent watchdog, and restore verified last-known-good plugin configurations without retrying failed recovery indefinitely.

  Protect the last healthy replica unless an authorized operator explicitly permits downtime. Pin replacement admission to the active generation's cumulative plugin manifest so queued updates cannot block the current rollout or inherit outage consent.

- 558b1cd: Add provider model discovery and incremental imports for LLM, embedding, and rerank models. Preserve edited configuration across synchronization, expose model sources and editable limits, and apply the synchronized catalog to model selection and execution access.
- f60db7b: Remove the legacy Project migration service and its automatic startup backfill. API startup no longer scans existing Projects, rewrites legacy membership or task state, indexes old assets, or disables enabled automations. Keep normal Project creation, content initialization and plan provisioning in their existing business services.

  Deprecate `project.members` in favor of `memberships` and the Project membership API. Legacy membership data is not migrated or used as an authorization fallback.

## 3.21.2

### Patch Changes

- e42fc94: Make tenant and organization Agent Plugin installations directly available in the ChatKit Plugins menu. Remove workspace publishing and addition from Cloud and Desktop, prepare selected runtime resources on demand, and retain existing conversation versions, expert mappings and Connector configuration.

  Tenant packages inherit into organizations without sharing Connector credentials. Existing databases created with the original Agent Plugin SQL schema should apply `20261012-agent-plugin-installation-scope.sql` to allow tenant-scoped records.

- 7de8eae: Update ChatKit packages to 0.14.2 to preserve pending project confirmation when restoring conversations, and synchronize the API, Web and Desktop deployment lockfiles.
- f304e7b: Expose the current user's ClawXpert initialization status and recover missing or inaccessible bindings through the existing membership bootstrap queue. Recheck active organization membership before delayed jobs run, retain initialization failures for retry, and keep default workspace skill setup independent of ClawXpert creation failures.

  Add an explicit Primary LLM verification endpoint with bounded output and a 20-second deadline, and include the configured model when reading an available Copilot.

- d9db433: Reuse the desktop model cascader across application, template and assistant settings with custom field labels. Preserve authorized provider logos from Xpert, connection, capability and context metadata for model search and comparison without exposing credentials or changing installation selections.

  Keep the portaled model list scrollable inside desktop dialogs while preserving focus and background scroll locking.

- a2e5e2c: Check required permissions by membership instead of counting matching role records. Duplicate enabled grants no longer deny Project catalogs or substitute for a different missing permission. Apply the same behavior to the server and Plugin SDK request contexts.
- 672810f: Preserve authorized MCP App results after interactive sessions expire and allow explicit recovery without rerunning the original tool. Recheck current message, Assistant and connector access, prevent stale replicas from replacing renewed sessions, and remove saved history with its owning conversation or messages.

  Expose a server-only View middleware runtime capability so plugins can reuse authorized Assistant configuration and connector bindings without inventing an Agent execution. Redact session credentials from HTTP request URLs and query logs.

  When TypeORM schema synchronization is disabled, apply `packages/server-ai/src/mcp-app-runtime/migrations/20261012-mcp-app-history.sql` before deploying the history and recovery endpoints.

- 94ca78f: Enable MCP Apps in all environments without a separate opt-in setting. Remove the global feature gate from App registration, restoration and resource/RPC access so production assistants can present configuration forms by default.
- 97b58fc: Restrict plugin installation schema synchronization to the current plugin's tables and owned join tables while retaining reference metadata for foreign keys. Prevent runtime entity registration from synchronizing the whole database, so installing one plugin does not alter host tables or unrelated plugins such as DOCX Editor.
- 23c94f4: Preserve pending project creation across history restoration and recover affected conversations during authorized App confirmation. Keep existing project bindings and personal conversations immutable.
- 02f3081: Release API and Web application images alongside the shared ClawXpert initialization recovery contracts and MCP App history / View runtime plugin SDK updates. Keep both application images aligned with the updated shared packages.
- f816d25: Update the ChatKit packages consumed by Xpert to 0.14.1 and synchronize the API, Web and Desktop deployment lockfiles.

## 3.21.1

### Patch Changes

- 1435b5b: Expose HTTP API request counts and response-duration histograms by full registered route template, method, status, response type, and completion outcome. Track case-insensitive API paths and parameterized or aliased router mounts without retaining resolved request identifiers. Keep SSE and aborted responses separate, exclude scrapes and health checks, and provide a 500ms bucket for slow API request monitoring.
- ae1fb5f: Add scoped knowledgebase discovery, readiness and action-permission APIs with authorization-aware cursor pagination. Preserve the legacy list behavior with deprecation guidance, and fail indexing when supplied generated-image semantics are invalid instead of indexing placeholder content.

  Clarify runtime and provisioning API responsibilities, and organize the SDK guides into English documentation with updated navigation, branding, package assets and cross-references.

## 3.21.0

### Version Alignment

- Align the API version baseline with `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk` at 3.21.0, avoiding the historical 3.11.0 Docker image tag. Subsequent API releases continue to require an application Changeset.

## 3.11.0

### Minor Changes

- 9525b02: Release the API image with shared group conversations, participant-aware message routing, and conversation-scoped ChatKit credentials alongside the updated contracts and server-ai packages.

### Patch Changes

- eecb9fa: Configure required builtin toolsets when enabling marketplace applications. Discover and deduplicate template dependencies across Assistant suites, select authorized source configurations, and provision independently managed copies before installing Assistants. Preserve toolset IDs during repair, roll back newly created copies on failure, and include them in installation health checks.

  Prepare a scoped configuration Workspace before opening toolset authorization. Persist new toolset bindings directly in that Workspace, support resuming or explicitly discarding unactivated configuration, and retain saved authorization after activation failures. Reject invalid Workspace identifiers before database access.

- 7b1c018: Fix PostgreSQL UUID/text parameter comparison in personal workspace lookup, which caused Bosi onboarding to return HTTP 500 before loading capabilities and services. Preserve scoped workspace reuse and cover first-time creation and retries with PostgreSQL regression tests.
- c9f9379: Group Knowledge capabilities under `rag/capability` and expose resumable upload sessions through `Documents.uploads`. Support idempotent document imports without automatic processing, plus filename and folder-path search with MIME type filters so unprocessed images remain discoverable.

  Allow organizations to read public tenant libraries while requiring super administrators to explicitly select tenant scope before managing them. Keep document processing behind write-access checks without switching the caller's request scope. Release the SDK and host implementation together for the new upload API.

- eecb9fa: Support explicit coordinator and nested role dependencies in application Assistant suites. Validate delegation graphs, publish dependencies before callers, and include nested links in installation health checks. Repair entry-only installations in place, restore published drafts when needed, and retain scoped partial resources and all existing knowledgebase IDs for idempotent retries.
- c5e19d5: Make plugin runtime convergence account for registered API replicas without a fixed registration window. Retain failed rollout outcomes, guard late replica catch-up, allow authorized retirement of offline instances, and synchronize organization plugin removals. Hide manual restart prompts from non-SuperAdmin users while retaining background progress.
- 5aa4692: Ship official Agent plugin imports and resumable plugin installation during system setup in the API and Web application images. Include the shared contracts, plugin SDK, and server changes required by these features.

## 3.10.1

### Patch Changes

- d18aa7f: Allow up to 128 exact relative file paths in explicit Agent output deliveries, for
  both individual files and archives. Keep relative-path validation and wildcard
  rejection unchanged.

  Extract the existing 10 MiB Assistant workspace upload limit into a shared server
  constant so runtime adapters can reuse it without depending on the HTTP controller.
  This does not change upload size or workspace access checks.

- b86bba1: Add resumable personal Bosi onboarding with tenant, organization and user isolation, private workspace preparation, workspace service connections, capability-aware model selection and recoverable template installation. Reuse existing Assistant bindings and persist initialization and welcome progress.

  Add authorized public Assistant name and avatar updates, a Desktop appearance studio with configurable characters, uploaded images and pets, and ChatKit appearance and computer controls. Preserve published configuration when saving profile fields and keep Assistant capability changes behind explicit settings saves.

- b86bba1: Bundle shared model profiles for Codex, Claude Code, OpenCode, Aider, Qwen Code, Kimi and CodeBuddy, with a pinned toolchain and cloud-coding skill. Route shell-driven coding work through execution-scoped platform model access and enable coding tools with default policies.

  Load the optional local-shell sandbox plugin when explicitly configured and align its registration metadata with its package release. Keep sandbox service discovery passive and distinguish configuration errors from unavailable services.

- ada086b: Declare jsdom as a direct Desktop development dependency so isolated installer builds can run the renderer tests without relying on transitive server dependencies. Regenerate the Desktop dependency lock for reproducible CI installs.

  Use ES2020-compatible quote escaping for execution usage CSV exports so the Web production build succeeds without raising its browser library target.

  Exclude test-support directories from the server-ai production compilation so Jest mocks remain available to tests without entering API build output.

- b86bba1: Add execution-scoped model grants, protocol bridges, CLI launchers, budget enforcement, attributed usage settlement and audited reconciliation. Expose the native model SDK and scoped host runner capability, and accept CLI prompt-cache hints without forwarding provider credentials to execution environments.

  Add typed Agent execution results, authorized file delivery and bounded task observation. Preserve background execution during logout, centralize conversation file access, retain explicit Assistant middleware configuration, and allow validated text-only receipts from image-capable tools. Include the API and Web releases required by these shared contracts and runtime changes.

- f5add6a: Remove the ModelExecution per-request input cap and the byte/token comparison from
  Chat, native and bridged CLI requests. Read and discard legacy maxInputTokens in
  persisted policies and grants. Reserve estimated request tokens plus output against
  cumulative budgets; settle using provider usage facts as before.

  Expose the selected model's catalog context window to CLI profiles instead of deriving
  it from tenant input limits. Custom CLI profiles must migrate from limits.maxInputTokens
  to optional model.contextWindow. Upgrade the host and profiles together and start a new
  execution to regenerate CLI configuration.

  Remove the extra output cap and fixed Qwen/CodeBuddy turn caps. Use optional catalog
  output metadata for CLI configuration, make execution token budgets explicit opt-ins,
  and distinguish rate/concurrency errors from budget exhaustion. Honor active response
  streams using an inactivity timer, and do not recover live grants as lost workers solely
  because their calls are old. Republished Assistant versions no longer invalidate an
  otherwise authorized execution.

- b86bba1: Provide a shared CQRS entry point for resolving user organization access, keeping role-specific access policy out of business callers. Add a reusable Zod request-validation pipe and skip plugin schema synchronization when a plugin declares no entities.

## 3.10.0

### Minor Changes

- e4485ba: Release Bosi Desktop, API and Webapp together for configurable digital experts.

  Bosi can create blank assistants and edit their model, optional capabilities and instructions. Personal profile overrides remain local, while shared assistant settings require workspace edit access and take effect after publishing.

  Add an extensible Assistant capability registry, model and runtime compatibility checks, and configuration APIs with stale-edit protection. Keep cloud computer support in the Pro capability provider, and preserve existing workflow settings when managed capabilities change.

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 79cc75a: Publish application Docker images only for their own Changesets. Build scoped candidates, require consumed Changesets for stable releases, and check that shared package releases include their consuming applications.
- ce73ebe: Upgrade the shared ChatKit packages to 0.8.0 across the API, Web and Bosi desktop applications.
- 7108a25: Publish API and Web candidates together for the shared execution-navigation contract changes.

## 3.9.0
