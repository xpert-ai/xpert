# @xpert-ai/server-ai

## 3.29.0

### Minor Changes

- 78cd9c0: Expose project Artifact references through Content Catalog and the Artifact Library capability. Add authenticated read-only viewing, pinned version selection, reusable sharing and explicit copy policy without creating shares during collection or viewing.

    Expose provider-owned localized Artifact type names in Spaces lists, cards and share management so shared conversations remain recognizable independently of the reference relationship.

- 78cd9c0: Add ArtifactTypeProvider contributions with loader-owned namespace, explicit installation binding, content validation, sharing restrictions, and snapshot or authenticated presentation modes. Persist typeBinding on Artifact and deny unbound or unavailable types without fallback. Reuse the existing Artifact runtime API and Presentation Provider protocol.

    Implement conversation snapshots as a built-in Artifact plugin, retaining the ChatKit read-only message UI and source authorization. Add an isolated anonymous snapshot viewer without a query channel; keep authenticated queries scoped to the current viewer and matching plugin installation. Remove the previous host-only source-policy contract. Existing experimental untyped records are not automatically converted.

- 4b07221: Add the built-in administrator execution-observability plugin with an expandable Assistant/conversation timeline and five read-only analysis tools. Reuse scoped existing execution and usage records, preserve unknown lifecycle phases and costs, and ship shared shadcn/Tailwind remote assets without new tables.
- 78cd9c0: Add revocable, expiring conversation text snapshots with organization membership checks, opt-in public links, a full-width Cloud viewer using ChatKit's read-only message list, preview validation, and bearer-token log protection. Project and group conversations cannot be exported. The shared renderer receives only authorized text and theme data, without live conversation credentials.

    Add a personal shared-links settings dialog with search, pagination, owner-only snapshot previews, and confirmed single/bulk revocation. Management excludes delegated Assistant credentials and preserves conversations and shares created after the reviewed cutoff.

    Persist conversation exports through existing Artifact containers, immutable ArtifactVersions and revocable ArtifactLinks. Reopening and copying reuse the stored URL. Enforce conversation source availability and export restrictions on shared Artifact content entrypoints, including raw URLs. No separate ConversationShare entity or token-recovery migration is introduced.

    Keep conversation rules in conversation-sharing as a built-in Artifact type plugin with Artifact-owned share queries. The conversation feature module registers its type and host view directly, without a separate built-in plugin aggregation module. Register through the SDK type protocol, persist the installation binding, and reject unavailable types without fallback. The former host-only source-policy interface is removed.

    Use the existing CLIENT_BASE_URL for share and management URLs, exposed through the shared clientBaseUrl bootstrap setting. Conversation sharing requires no feature-specific deployment configuration. Public sharing is available by default but still requires explicit owner confirmation; the default audience remains organization-only with a seven-day expiry.

### Patch Changes

- 4ee32d7: Allow all validated opaque content revisions to be persisted and isolate collaboration state encoding helpers.
- c4c344f: Build Artifact Library URLs from the effective frontend configuration so bootstrap overrides point users to the configured host.
- b459105: Preserve new messages sent after interrupted tool runs by checkpointing input identities and committing their consumption with model history. Keep new Send, checkpoint Resume/Retry, and tool/model loops distinct; preserve completed tool results and record unknown outcomes for missing results without rerunning old tools. Add graph-level regression coverage for interruption, repeated input text, recovery, middleware, and delegated input scope.
- 2e717f0: Allow provider-declared native Responses by default for delegated model execution so Codex retains configured reasoning effort instead of entering the limited Chat bridge. Preserve explicit tenant protocol restrictions and require a new execution for the updated protocol selection.
- 2aae0fa: Expand the catalog revision column in place before entity synchronization, preserving existing provider revisions during upgrades.
- Updated dependencies [78cd9c0]
- Updated dependencies [78cd9c0]
- Updated dependencies [4b07221]
- Updated dependencies [b459105]
- Updated dependencies [78cd9c0]
- Updated dependencies [3b03ad7]
    - @xpert-ai/plugin-sdk@3.29.0
    - @xpert-ai/contracts@3.29.0
    - @xpert-ai/server-core@3.29.0
    - @xpert-ai/shadcn-ui@0.2.2
    - @xpert-ai/server-config@3.29.0
    - @xpert-ai/server-common@3.29.0
    - @xpert-ai/desktop-protocol@0.4.1
    - @xpert-ai/server-auth@3.29.0

## 3.28.0

### Minor Changes

- f9b312a: Add a Project-scoped content catalog with explicit model and edit-protocol compatibility, editor preferences, safe source fallback and revision-bound search projections. Resolve stable catalog identities to authorized plugin selections, permit on-demand Project editor discovery independently of Assistant tools, and authorize Project-owned Artifact drafts through current member rights.

    Provide a reusable Assistant capability composition helper. Preserve unacknowledged and offline collaboration updates across reconnects, invalidate pre-archive CAS revisions on restore, and admit direct chat runs before persisting recovery checkpoints. Requires coordinated host, SDK, ChatKit and resource-plugin deployment.

    Keep failed collaboration projections retryable: reject failed queue attempts, recover stale durable checkpoints after restart, and replay only the latest active document state without requiring an open browser.

    Return explicit access/unavailability errors for stale client actions after a resource provider is uninstalled, while preserving authorized read-only source backups.

    Reuse the shared I18nObject contract for content type and implementation labels instead of introducing a separate mandatory bilingual shape.

    Persist credential-free, immutable create/copy intents and recover them after restart. Reconcile source projections and notify knowledge observers using current Project membership and Assistant access. Add revision-checked Artifact draft recycling that revokes shares atomically; restoring a draft never republishes previous links. Apply `20261026_content_operations.sql` before enabling the maintenance worker.

### Patch Changes

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

- 76656ca: Reduce thread capability read overhead by loading only the published graph and execution settings needed for recovery validation, without expanding workflow collection relations. Preserve runtime access checks, graph revision compatibility, and complete retry checkpoint validation.
- 7535029: Support automatic Agent runtime bindings across Computer, SDK, process and external service transports. Preserve existing execution protocols and interactive approvals while removing user profile/binding forms. Derive authorization from the current actor and Assistant, and resolve launch settings from installed strategies through a scoped capability, without a host runtime inventory. Old configuration is not migrated or reused.
- b21c640: Persist MCP execution ownership before sending work, redeliver original-generation control and retain settlement until handlers and attached work actually finish. Add a negotiated control receipt, unique task admission, non-replaying input continuation, and conversation pause/termination bridges. Include conservative migration for legacy tasks.
- 5d46f25: Preserve the authenticated ChatKit audience while dispatching an authorized external Assistant from a background task. Revalidate live access, scope delegation through stream subscription, and report the actual executor and startup error for task reconciliation.
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
    - @xpert-ai/cli-model-profiles@0.2.2
    - @xpert-ai/plugin-sdk@3.28.0
    - @xpert-ai/server-core@3.28.0
    - @xpert-ai/desktop-protocol@0.4.0
    - @xpert-ai/server-config@3.28.0
    - @xpert-ai/server-common@3.28.0
    - @xpert-ai/server-auth@3.28.0

## 3.27.0

### Patch Changes

- 52a3241: Let Assistant capability providers explicitly opt into parameter-free creation switches through supportsQuickCreation. Cloud discovers these options from the server instead of hardcoding Project management, so Spaces and future plugins can participate without bespoke UI. Preserve model authorization, existing capabilities and revision-checked composition; apply and save all selected capabilities before publication.
- 33313f8: Reduce project-task polling work with a scoped run-status endpoint that selects lifecycle fields and business outcomes without loading execution payloads. Limit task-graph execution queries to timing and status fields.

    Pause project-task refreshes while their Workbench view or browser tab is hidden and resume when visible. Deduplicate avatars by content version and omit assets already cached by the client, preserving task state, access checks, and retry behavior.

- 147683a: Preserve reasoning and cache token details in priced LLM receipts so Model Gateway can validate and settle reasoning-model calls. Keep usage with unavailable or inconsistent pricing pending settlement instead of treating it as a successful zero-point charge. Add regression coverage from the SDK callback through gateway validation and idempotent membership ledger settlement.
- 078e6fe: Allow trusted Artifact document hosts to opt into exact HTTPS origins for scripts, styles, fonts and images while preserving the offline default and blocking direct data requests, frames, workers and eval. Share resource checks between preview routing and the document CSP.

    Preserve safe analytics error codes, failure stages, retryability and localized repair guidance in both HTTP responses and Agent tool errors. Distinguish read-only SQL rejection, parameter binding failures and output contract mismatches without exposing private provider errors. Add browser isolation coverage and regression cases for parameterized Doris month filters.

- 1aac9eb: Preserve existing toolset bindings when refreshing Assistant templates in workspaces with multiple instances of the same provider. Validate the bound toolset against the current organization and workspace, while retaining ambiguity checks for new installations and rejecting unavailable bindings. Isolate toolset dependency inspection in a dedicated method.
- 19dcf40: Preserve thread activity SSE updates when Nest has already flushed response headers, while retaining sanitized diagnostics for failed reads.
- 240a5fe: Declare Project authorization as an explicit dependency of workspace file access,
  and preserve tenant-shared Assistants after the authenticated actor passes the
  published catalog authorization checks.
- de45823: Keep document source contracts browser-safe and include their transitive types in
  the isolated Cloud build. Register durable display snapshots and conversation
  revisions in the packaged SQL migration flow so clean databases initialize in
  dependency order and existing deployments receive the required fields.
- Updated dependencies [52a3241]
- Updated dependencies [147683a]
- Updated dependencies [d6efa08]
- Updated dependencies [078e6fe]
- Updated dependencies [c3509ee]
- Updated dependencies [de45823]
    - @xpert-ai/contracts@3.27.0
    - @xpert-ai/plugin-sdk@3.27.0
    - @xpert-ai/server-core@3.27.0
    - @xpert-ai/desktop-protocol@0.3.11
    - @xpert-ai/server-auth@3.27.0
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

- d80b159: Include Poppler and validate LibreOffice, fonts and two-page UTF-8 extraction before document preview execution. Add the isolated LibreOffice NsJail binding and retain dependency, conversion, extraction and timeout diagnostics. Publish a new Runtime Suite artifact and regenerate production digest bindings through the release workflow; existing production locks are not changed by this source fix.
- 0bcd7a7: Prevent independent background Assistant tasks from inheriting the caller's workspace storage lock leases during execution creation and subscription. Preserve authorization and invocation context, idempotent dispatch, and stale-owner fencing so tasks can read and save results after the caller releases its lock.
- c59009d: Add a built-in NsJail Compute Runtime Provider so open-source deployments can run Python and JavaScript Workspace Script Actions without a Pro Runtime Provider. The Runner includes the pinned Compute rootfs and a separate authenticated, offline Jobs protocol with read-only inputs, bounded scratch storage, cgroup v2 resource limits, streamed host invocations and deterministic cleanup. Update both API and Runner together; Compute remains unavailable on older Runners or without cgroup v2 isolation.
- 06be3c0: Provide hardened open-source NsJail bindings for AnyDoc and OpenDataLoader document Jobs, with locked native/Java/OCR dependencies, isolated profile lifecycles and real image acceptance checks. Correct document Artifact catalog families and validate release metadata. Deploy the matching API and Runner together; existing Runners fail document readiness closed.
- 389933d: Require pipeline templates to declare their supported application and project types. Filter the configuration catalog and enforce the persisted project type when saving configurations and starting runs, so templates cannot execute in unrelated projects.

    Upgrade pipeline contributions together with the host and create compatible configurations for typed projects; legacy definitions without an explicit project type are not implicitly accepted. Preserve runtime scope in the remote-view preview host for realistic plugin verification.

    This release intentionally remains on the 3.x patch line. Before upgrading, add
    explicit `projectTypes` declarations to existing pipeline contributions and saved
    templates. Older templates are rejected; no compatibility fallback is provided.

- c59009d: Preserve known Sandbox Runtime dependency error codes across the Analytics boundary with safe, localized remediation and retry policy. Keep arbitrary plugin HTTP errors, messages and execution details redacted.

    Allow targeted Runtime family publication without npm publication or rebuilding already published families, and verify the full API manifest contract before image promotion.

    Report invalid Action script inputs separately from Runtime startup failures, with fixed guidance about the Workspace script entrypoint and standard-library contract. Runner output remains private.

- Updated dependencies [2e052d5]
- Updated dependencies [d80b159]
- Updated dependencies [b743428]
- Updated dependencies [389933d]
- Updated dependencies [32d695d]
- Updated dependencies [c59009d]
    - @xpert-ai/server-core@3.26.2
    - @xpert-ai/plugin-sdk@3.26.2
    - @xpert-ai/contracts@3.26.2
    - @xpert-ai/desktop-protocol@0.3.10
    - @xpert-ai/server-auth@3.26.2
    - @xpert-ai/server-common@3.26.2
    - @xpert-ai/server-config@3.26.2

## 3.26.1

### Patch Changes

- c553b26: Introduce one canonical Analytics source model and runtime for database connections, versioned Definitions and Artifacts. Add scoped configuration management and settings UI, and restrict DataSource Types to real database drivers. Remove versioned protocol adapters and migration inventory. Analytics plugins and saved documents must use the canonical source envelope; this release intentionally does not decode historical Bindings.

    Use the shared JSON Schema form and Zard controls for Analytics settings, including nested schema references, union choices and JSON values. Fix the settings navigation icon.

    Add scoped Agent definition authoring, provider inspection/preflight, and retry-safe immutable registration. Make Analytics settings a management-only surface.

    Resolve unnamed MCP servers consistently between automatic definition discovery and the MCP runtime, and reject ambiguous normalized server identities.

    Explain duplicate-grain validation failures to Agent tools without exposing upstream errors, enabling repair of search-result tables that contain multiple snippets per URL.

- 4d2e927: Correct invalid GraphRAG identity model responses once before failing the document job, preserving strict candidate validation and saved extraction reuse.
- 32bb151: Fix Linux template file initialization by reusing validated directory handles during create-only writes. Preserve existing files, directory containment, and rejection of untrusted symlinks.
- 2984151: Show the explicit Project tasks capability label in Studio middleware settings before falling back to linked view titles. Preserve runtime activation, navigation and access checks for task results and coding execution views.
- d55c27c: Use an empty configuration only when middleware options are omitted across tool preview, testing, execution and View runtime resolution, including previously published Assistant nodes. Preserve explicit invalid values for provider validation and keep runtime node context consistent without rewriting saved graphs.
- a6f9323: Allow signed-in Assistant sessions to start Project pipelines with live Project, Assistant and Connector permission checks, without development-only environment or Project allowlists. Preserve durable delegation requirements for resource credentials and log safe diagnostics when pipeline observation is deferred.

    Resolve saved pipeline subjects to their authorized business Workbench view through an optional subject adapter entry, so opening the business workspace stays inside Bosi and selects the associated review.

    Make pipeline cards and headers more compact, add persistent zoom and fit-to-view controls, and combine zoom with the status bar. Separate sequential steps and logical nodes into dependency-ordered columns with dedicated control headers and dividers, and place lane execution indicators at the bottom right.

- 2bdca1e: Align the active Project tasks tab underline with the navigation bar's bottom border by removing the tab list inset and making tab buttons fill its height.
- Updated dependencies [c553b26]
- Updated dependencies [80b5c53]
- Updated dependencies [d55c27c]
- Updated dependencies [a6f9323]
- Updated dependencies [37ae32f]
    - @xpert-ai/contracts@3.26.1
    - @xpert-ai/plugin-sdk@3.26.1
    - @xpert-ai/server-core@3.26.1
    - @xpert-ai/cli-model-profiles@0.2.1
    - @xpert-ai/desktop-protocol@0.3.9
    - @xpert-ai/server-auth@3.26.1
    - @xpert-ai/server-common@3.26.1
    - @xpert-ai/server-config@3.26.1

## 3.26.0

### Minor Changes

- 23b505e: Allow side chats to fork the latest sealed assistant reply while the source keeps running. Validate and copy pinned root, subgraph and ancestor checkpoints without pending work or live Goals. Reuse the created thread when a request is retried after the source advances.

    Expose the same behavior from Conversation Map and return a localized explanation when no sealed reply is available. Keep bodyless legacy copies idle-only and preserve historical input editing. Shared checkpoint references remain a separate, unimplemented architecture proposal.

### Patch Changes

- c9027ea: Prevent new-version Assistant publication from cascading a version-number update into its primary Agent and falsely reporting AgentOutdated when the Agent inherits its model. Preserve stale-Agent checks, transactional version backups and rollback, and cover these paths with PostgreSQL regression tests.
- 138821f: Allow Assistant templates to select an authorized language model without requiring a Primary configuration. Resolve existing bindings and eligible defaults from the governed model catalog, preserve model options, and revalidate access before installation.
- 629d5fa: Preserve the current organization when initializing MCP services and connections from tenant-installed plugins. Keep organization instance state and synchronization scoped to that organization.
- d3ad3a5: Refresh the Cloud assistant sidebar after successful template installation. Preserve installation history while reporting current target availability, disable opening deleted or inaccessible assistants in Cloud and Desktop, and clear stale opening errors when starting another installation. Keep interrupted-request recovery and idempotency intact.
- 54778dc: Extend the existing schema-sync deployment job with TypeORM SQL migrations. Ordinary tables still synchronize from entities; explicitly SQL-managed tables are excluded. Package module-local SQL and checks, preserve migration checksums, support verified baseline adoption, and serialize host/plugin DDL using a shared PostgreSQL lock.

    Disable API startup DDL in development as well as production. Share installed plugin mounts with Compose migration jobs and fail on incomplete plugin registration. Preserve legitimate undispatched ModelExecution calls during baseline adoption, with regression coverage for independently reconstructed legacy databases.

- Updated dependencies [f0590e2]
- Updated dependencies [23b505e]
- Updated dependencies [d3ad3a5]
- Updated dependencies [54778dc]
    - @xpert-ai/contracts@3.26.0
    - @xpert-ai/server-core@3.26.0
    - @xpert-ai/server-config@3.26.0
    - @xpert-ai/desktop-protocol@0.3.8
    - @xpert-ai/plugin-sdk@3.26.0
    - @xpert-ai/server-auth@3.26.0
    - @xpert-ai/server-common@3.26.0

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.

### Patch Changes

- babce0b: Return typed errors for disallowed or unavailable Assistant model selections. Preserve failed execution and thread error details while releasing the run claim after admission rejection.
- c2b52ba: Allow published Assistants to continue after ordinary plugin version or resource definition changes, with non-blocking update recommendations. Preserve exact installation snapshots, explicit template version requirements, scoped dependency availability and ownership, immutable artifact integrity, and actionable runtime errors.
- 4ff6010: Use the resolved model context window consistently for primary calls and context compression. Preserve explicit provider limits and remove model-name guesses that can incorrectly reject summary input for custom endpoints.
- 0f55121: Preserve explicitly declared streaming tool calls when converting legacy custom model settings. Share the conversion between model catalogs and execution admission, keep saved model configuration features authoritative, and require a separate explicit declaration for multi-tool-call support.
- 854a4c0: Expose optional business-task concurrency policy on Project type declarations and
  their catalog. Entity-backed applications enforce it in business dispatch and
  claim services; generic Agent execution and model configuration are unchanged.
- 1b5096f: Validate provider credentials before saving by reusing model discovery when supported, or by testing a user-selected model or endpoint. Expose an optional SDK validation policy and typed preview API, show discovered models and actionable authentication errors, and repeat validation on save without persisting the test target.
- 2aada62: Include runtime entities in standalone schema synchronization so externally managed fresh databases contain Sandbox jobs and managed services, invocation and delivery records, and the other entities already registered by runtime feature modules.
- Updated dependencies [3e0460d]
- Updated dependencies [babce0b]
- Updated dependencies [c2b52ba]
- Updated dependencies [ba77738]
- Updated dependencies [4ff6010]
- Updated dependencies [0f55121]
- Updated dependencies [8a0c256]
- Updated dependencies [27fab44]
- Updated dependencies [854a4c0]
- Updated dependencies [1b5096f]
- Updated dependencies [1cd5a33]
    - @xpert-ai/server-auth@3.25.0
    - @xpert-ai/server-common@3.25.0
    - @xpert-ai/server-config@3.25.0
    - @xpert-ai/contracts@3.25.0
    - @xpert-ai/plugin-sdk@3.25.0
    - @xpert-ai/server-core@3.25.0
    - @xpert-ai/desktop-protocol@0.3.7

## 3.14.1

### Patch Changes

- Updated dependencies [2e7af88]
    - @xpert-ai/plugin-sdk@3.24.0
    - @xpert-ai/server-core@3.10.9

## 3.14.0

### Minor Changes

- c4f9bb3: Add organization member sharing and scoped user-group authorization for Assistants. Separate resource sharing from organization group management, enforce active organization membership and runtime-only grants, and keep access changes consistent across published versions.

    Use the existing Zard UI theme for the sharing page and hide group authorization when the account cannot view organization user groups.

### Patch Changes

- 2e488be: Manage data retention exclusively from the default tenant and apply its cleanup switches and retention periods to all tenants. Ignore other tenants' previous retention overrides, preserve conversation references and pending settlements, and retain model usage facts when removing expired call records. Only default-tenant SuperAdmins can change these global policies; missing or disabled default policies do not trigger cleanup.

    Keep retention parameters out of the generic tenant settings editor and only display saved changes after the request succeeds. Failed saves preserve the original value and editable draft and show an error.

- Updated dependencies [c4f9bb3]
- Updated dependencies [2e488be]
    - @xpert-ai/contracts@3.23.0
    - @xpert-ai/server-core@3.10.8
    - @xpert-ai/desktop-protocol@0.3.6
    - @xpert-ai/plugin-sdk@3.23.1

## 3.13.0

### Minor Changes

- ddeb74f: Add presentation-only skill command and subcommand metadata to portable Agent Plugins. Resolve shortcuts from pinned selections, re-authorize explicit skill activation, and preserve literal subcommand arguments in task messages and history.

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

- 616bab6: Allow automatic context compression during long tasks at complete tool cycle boundaries. Preserve the current user request, recent and in-flight tool calls, and matching tool results so compressed histories remain valid. Keep manual compression at whole-turn boundaries.
- 94dd967: Run one-click official Agent plugin imports as background jobs so large catalogs no longer keep a single HTTP request open. Persist progress per tenant and organization, show incremental results, and resume the same Git snapshot after page reloads or API restarts without repeating completed imports. Duplicate requests reuse the running job, and partial package failures remain visible.
- 1a60257: Include published Agents from organization-shared workspaces in group invitation candidates while preserving tenant, organization, group-owner, and authoring permission boundaries. Show only the latest Agent versions and exclude active group members, including other versions of an Agent already in the group, before pagination.

    Apply stable database pagination and let Desktop load all candidate pages. The API keeps its array response and accepts optional limit and offset parameters; the ChatKit load-more interface requires the matching SDK and ChatKit releases.

- 616bab6: Resolve published Assistant environments through runtime authorization so users allowed to run an Assistant can use its configured environment without authoring workspace access. Draft execution retains authoring access checks.
- 616bab6: Add the SandboxWorkspaceMount contract and optional workspaceMounts provider creation option for mounts resolved after application authorization. Include conversation scope in application-side Sandbox acquisition and cache identity without forwarding business authorization context to providers.
- ddeb74f: Bind an enabled template sub-agent's unspecified Sandbox provider to the parent Assistant's configured provider before dependency validation and execution snapshotting. Preserve explicit template providers and reject unavailable providers before creating task state.
- Updated dependencies [5afe7d1]
- Updated dependencies [94dd967]
- Updated dependencies [8ecf7b0]
- Updated dependencies [94dd967]
- Updated dependencies [616bab6]
- Updated dependencies [4bf9514]
- Updated dependencies [616bab6]
- Updated dependencies [ddeb74f]
    - @xpert-ai/contracts@3.22.0
    - @xpert-ai/server-core@3.10.7
    - @xpert-ai/plugin-sdk@3.23.0
    - @xpert-ai/desktop-protocol@0.3.5

## 3.12.4

### Patch Changes

- 4e29238: Resolve Agent Plugin connector definitions from persisted tenant and organization configuration so catalogs, OAuth callbacks and runtime calls work across API replicas and restarts. Preserve historical connector identities and authentication methods when a native provider replaces generic MCP OAuth.

    Allow supported connectors to select or create a system integration in the connection dialog, remember its ID for reconnects, and resolve application credentials using the connection's persisted scope. Generate integration names automatically and deduplicate retries. GitHub requires the companion GitHub Connector plugin update to expose this flow and replace dynamic client registration.

- ab15014: Fix Conversation Map validation errors when newly created conversations do not yet have a title, with a consistent fallback for missing or blank titles.

    In tree mode, combine uninterrupted message paths into summary nodes and split them at actual message forks. Show only the latest human question and a short AI reply, and open the actual conversation history for message details and individual message actions. Read lightweight ancestry metadata and batch only the message bodies needed for summaries instead of loading complete histories for every branch. Preserve relation graph, list, and search behavior.

- 3b7f2cd: Extend the existing api_key table and authentication flow with USER-bound personal keys in account settings, with one-time secret display, hashed storage, expiration and revocation. Use the same endpoints and authentication flow as existing API keys, restoring the personal key's human owner and current permissions. Preserve ordinary login-only management endpoints and the existing resource-key and ChatKit session flows; no personal-key-specific route opt-in is required.

    Instances that tested the separate-table draft can preserve those credentials with the one-time `packages/server/src/api-key/personal-api-key/migrate-personal-api-keys.sql` script after schema synchronization.

- Updated dependencies [4e29238]
- Updated dependencies [3b7f2cd]
- Updated dependencies [2f25689]
    - @xpert-ai/plugin-sdk@3.22.2
    - @xpert-ai/server-core@3.10.6
    - @xpert-ai/contracts@3.21.3
    - @xpert-ai/desktop-protocol@0.3.4

## 3.12.3

### Patch Changes

- 558b1cd: Add provider model discovery and incremental imports for LLM, embedding, and rerank models. Preserve edited configuration across synchronization, expose model sources and editable limits, and apply the synchronized catalog to model selection and execution access.
- f60db7b: Remove the legacy Project migration service and its automatic startup backfill. API startup no longer scans existing Projects, rewrites legacy membership or task state, indexes old assets, or disables enabled automations. Keep normal Project creation, content initialization and plan provisioning in their existing business services.

    Deprecate `project.members` in favor of `memberships` and the Project membership API. Legacy membership data is not migrated or used as an authorization fallback.

- Updated dependencies [f60db7b]
- Updated dependencies [558b1cd]
    - @xpert-ai/server-core@3.10.5
    - @xpert-ai/contracts@3.21.2
    - @xpert-ai/plugin-sdk@3.22.1
    - @xpert-ai/desktop-protocol@0.3.3

## 3.12.2

### Patch Changes

- e42fc94: Make tenant and organization Agent Plugin installations directly available in the ChatKit Plugins menu. Remove workspace publishing and addition from Cloud and Desktop, prepare selected runtime resources on demand, and retain existing conversation versions, expert mappings and Connector configuration.

    Tenant packages inherit into organizations without sharing Connector credentials. Existing databases created with the original Agent Plugin SQL schema should apply `20261012-agent-plugin-installation-scope.sql` to allow tenant-scoped records.

- 795f24a: Unify managed Assistant application state under WorkspaceFilesRuntimeCapability.appData(). Resolve namespaces from loaded plugin metadata; revalidate the current actor and published Assistant on every operation. Shared workspaces remain supported unless the application requires user isolation. Reuse atomic Volume writes and shared-filesystem locks, and protect .apps from generic Files, downloads, parser inputs and sandbox file uploads. Preserve Studio draft access through explicit authoring authority.

    NsJail Runner protocol 3 masks .apps with an empty read-only mount and blocks file RPC access. Upgrade the Runner before the API; older Runners fail closed. Local Shell is trusted development execution and does not provide OS isolation. No old application data is migrated.

    Pin application handles to their original workspace, and reject private file projections after a switch to shared storage. Renew lock leases only after successful filesystem heartbeats, verify lock ownership before mutations, and preserve replacement owners on release. Reject root aliases into managed data and protect managed descendants during recursive deletion.

- 7de8eae: Update ChatKit packages to 0.14.2 to preserve pending project confirmation when restoring conversations, and synchronize the API, Web and Desktop deployment lockfiles.
- f304e7b: Expose the current user's ClawXpert initialization status and recover missing or inaccessible bindings through the existing membership bootstrap queue. Recheck active organization membership before delayed jobs run, retain initialization failures for retry, and keep default workspace skill setup independent of ClawXpert creation failures.

    Add an explicit Primary LLM verification endpoint with bounded output and a 20-second deadline, and include the configured model when reading an available Copilot.

- d9db433: Reuse the desktop model cascader across application, template and assistant settings with custom field labels. Preserve authorized provider logos from Xpert, connection, capability and context metadata for model search and comparison without exposing credentials or changing installation selections.

    Keep the portaled model list scrollable inside desktop dialogs while preserving focus and background scroll locking.

- 672810f: Preserve authorized MCP App results after interactive sessions expire and allow explicit recovery without rerunning the original tool. Recheck current message, Assistant and connector access, prevent stale replicas from replacing renewed sessions, and remove saved history with its owning conversation or messages.

    Expose a server-only View middleware runtime capability so plugins can reuse authorized Assistant configuration and connector bindings without inventing an Agent execution. Redact session credentials from HTTP request URLs and query logs.

    When TypeORM schema synchronization is disabled, apply `packages/server-ai/src/mcp-app-runtime/migrations/20261012-mcp-app-history.sql` before deploying the history and recovery endpoints.

- 94ca78f: Enable MCP Apps in all environments without a separate opt-in setting. Remove the global feature gate from App registration, restoration and resource/RPC access so production assistants can present configuration forms by default.
- 23c94f4: Preserve pending project creation across history restoration and recover affected conversations during authorized App confirmation. Keep existing project bindings and personal conversations immutable.
- f816d25: Update the ChatKit packages consumed by Xpert to 0.14.1 and synchronize the API, Web and Desktop deployment lockfiles.
- Updated dependencies [e42fc94]
- Updated dependencies [795f24a]
- Updated dependencies [7de8eae]
- Updated dependencies [f304e7b]
- Updated dependencies [d9db433]
- Updated dependencies [a2e5e2c]
- Updated dependencies [672810f]
- Updated dependencies [97b58fc]
- Updated dependencies [f816d25]
    - @xpert-ai/contracts@3.21.1
    - @xpert-ai/plugin-sdk@3.22.0
    - @xpert-ai/server-core@3.10.4
    - @xpert-ai/desktop-protocol@0.3.2

## 3.12.1

### Patch Changes

- 1435b5b: Expose HTTP API request counts and response-duration histograms by full registered route template, method, status, response type, and completion outcome. Track case-insensitive API paths and parameterized or aliased router mounts without retaining resolved request identifiers. Keep SSE and aborted responses separate, exclude scrapes and health checks, and provide a 500ms bucket for slow API request monitoring.
- 9178ba1: Fix group Composer resource browsing, selection validation, and connector authorization for conversation-scoped ChatKit sessions. Recheck the live group membership and selected published Assistant before invoking resource services as the authenticated human, preserve Project and resource access checks, and restore the original request context after each operation.
- ae1fb5f: Add scoped knowledgebase discovery, readiness and action-permission APIs with authorization-aware cursor pagination. Preserve the legacy list behavior with deprecation guidance, and fail indexing when supplied generated-image semantics are invalid instead of indexing placeholder content.

    Clarify runtime and provisioning API responsibilities, and organize the SDK guides into English documentation with updated navigation, branding, package assets and cross-references.

- Updated dependencies [75f1cd3]
- Updated dependencies [ae1fb5f]
    - @xpert-ai/desktop-protocol@0.3.1
    - @xpert-ai/plugin-sdk@3.21.1
    - @xpert-ai/server-core@3.10.3

## 3.12.0

### Minor Changes

- 4fff330: Upgrade the shared ChatKit packages to 0.13.0 across Cloud, Desktop and server-side chat contracts, keeping workspace and deployment dependency locks aligned.

    Support shared group conversations with human and digital expert participants through the existing ChatKit chat, composer, header and workbench. Include participant-aware messages, member management and links to digital expert execution conversations, along with the new-tab workbench fallback and model names in context usage information.

### Patch Changes

- eecb9fa: Configure required builtin toolsets when enabling marketplace applications. Discover and deduplicate template dependencies across Assistant suites, select authorized source configurations, and provision independently managed copies before installing Assistants. Preserve toolset IDs during repair, roll back newly created copies on failure, and include them in installation health checks.

    Prepare a scoped configuration Workspace before opening toolset authorization. Persist new toolset bindings directly in that Workspace, support resuming or explicitly discarding unactivated configuration, and retain saved authorization after activation failures. Reject invalid Workspace identifiers before database access.

- 6fd5b42: Authorize Assistant runtime files through the exact published Assistant's access policy, independently of authoring workspace membership. Users granted access through a user group can read, upload, modify and delete shared Assistant files; user-scoped files remain isolated to the authenticated user. Revalidate access across runtime file entry points while preserving Studio authoring checks and Project access rules.

    Move conversation runtime file operations under `/ai/conversations/:id/workspace/*` to avoid colliding with the parsed attachment listing at `/ai/conversations/:id/files`. Preserve legacy single-file routes and deploy alongside the matching `@xpert-ai/xpert-sdk` Workbench route update. Document the two workspace concepts and verify collaborative access with local accounts.

- 0ee0b6c: Let conversation admission claim background Assistant runs instead of pre-marking conversations busy. Finalize reserved executions when startup is rejected and normalize nullable task errors to the optional receipt contract.
- 28ad9f5: Allow authenticated ChatKit hosts to read granted previews and downloads without browser cookies. Revalidate file-session ownership, Assistant binding, current resource access and file identity; preserve scoped grants, expiry, revocation, HEAD and byte-range responses.
- 7b1c018: Fix PostgreSQL UUID/text parameter comparison in personal workspace lookup, which caused Bosi onboarding to return HTTP 500 before loading capabilities and services. Preserve scoped workspace reuse and cover first-time creation and retries with PostgreSQL regression tests.
- f76a9c9: Let organization administrators import the official Agent plugins from one Git snapshot with a single button. Reuse existing package versions, isolate package failures, and display import results without granting workspace access. Expose the shared import command for system setup.
- c9f9379: Group Knowledge capabilities under `rag/capability` and expose resumable upload sessions through `Documents.uploads`. Support idempotent document imports without automatic processing, plus filename and folder-path search with MIME type filters so unprocessed images remain discoverable.

    Allow organizations to read public tenant libraries while requiring super administrators to explicitly select tenant scope before managing them. Keep document processing behind write-access checks without switching the caller's request scope. Release the SDK and host implementation together for the new upload API.

- eecb9fa: Support explicit coordinator and nested role dependencies in application Assistant suites. Validate delegation graphs, publish dependencies before callers, and include nested links in installation health checks. Repair entry-only installations in place, restore published drafts when needed, and retain scoped partial resources and all existing knowledgebase IDs for idempotent retries.
- 2e4de0a: Refresh the packaged coding execution, knowledge workbench, project tasks, scheduler detail, and conversation map assets so the shipped remote components match their current source implementations.
- 462f53d: Clean up audio files staged by the speech-to-text buffer API after transcription succeeds or fails, while leaving caller-owned uploads untouched. Log cleanup failures without discarding a transcript or masking the original transcription error.
- 82b8db4: Preserve the ENOENT error code when scoped workspace file operations encounter missing files or an uninitialized root. Document the in-process runtime file contract so plugins can distinguish missing files from other failures without interpreting localized messages. Keep path boundaries and HTTP error responses unchanged.
- Updated dependencies [eecb9fa]
- Updated dependencies [17e0342]
- Updated dependencies [f76a9c9]
- Updated dependencies [c9f9379]
- Updated dependencies [eecb9fa]
- Updated dependencies [c5e19d5]
- Updated dependencies [4b7a346]
- Updated dependencies [4fff330]
- Updated dependencies [82b8db4]
    - @xpert-ai/contracts@3.21.0
    - @xpert-ai/desktop-protocol@0.3.0
    - @xpert-ai/plugin-sdk@3.21.0
    - @xpert-ai/server-core@3.10.2

## 3.11.0

### Minor Changes

- a01cd48: Add the realtime voice model capability, model protocol adapter contract, and Bosi voice sessions. Assistant creation and settings can select an independently authorized realtime model and voice. The host relays bounded PCM audio over an authenticated, single-use-ticket WebSocket and dispatches durable Assistant tasks independently of call lifetime. Create the voice tables and timing columns through the platform's existing TypeORM entity synchronization (the schema-sync job in externally managed deployments), and configure allowed renderer origins before enabling calls. No separate realtime voice SQL migration is required.

    Introduce host-owned message envelopes with explicit source, target, correlation, and presentation for voice and future Assistant/Agent messages. Persist them in a dedicated typed `ChatMessage.messageEnvelope` JSONB column. Retain runtime execution, retry and branch history while applying consistent public-history filtering and protecting provenance from client edits. Apply the message-envelope migration before deployment.

- fd67ba0: Commit Runtime result references and outbox intents atomically, deliver them through Handoff with durable inbox acknowledgements, and arbitrate bounded waits against stable follow-up executions. Enforce thread writer admission, approval/user-stop barriers, current authorization, and recovery without replaying ambiguous CLI or model runs.

    Recover pending Project dispatch intents and observe running invocations independently of their parent. Project only the current unchanged attempt into in-progress, review or blocked; keep final business acceptance separate. Add owner-scoped delivery inspection and explicit redrive endpoints, and preserve review in simple-project task editing.

    Apply `20261006-runtime-reliable-replies.sql` after `20261006-project-task-runtime.sql` before deploying. These changes have local unit and isolated PostgreSQL coverage; live Computer/CLI acceptance remains a separate step.

- 00b626e: Separate Project Task creation from execution and add authorized Runtime discovery, explicit idempotent task dispatch, specification snapshots and task details. Persist attempts and pinned dispatch intents before launching through the existing Invocation runtime; serialize Project execution admission and preserve native handoff behavior.

    Support the built-in Project general agent as an explicit caller/reply identity. Computer invocations from this caller require a binding with an explicit `modelSource` referring to an accessible Assistant in the Project workspace; that Assistant supplies model policy, not caller identity or task ownership.

    Apply `20261006-project-task-runtime.sql` before deploying the host. This stage supports durable dispatch identity and explicit retry/inspection, but does not enable autonomous recovery scanning, reliable result messages, automatic continuation or acceptance workflows.

    Replace the legacy ProjectToolset and its creation command with the built-in `project-tasks` Middleware Plugin. Project general agents load it from the registry; Assistants can configure it through ordinary Plugin nodes and tool preferences. Preserve the six tool names while validating host-owned project/caller scope, localizing tool display metadata, and retaining Invocation status ownership.

- 3142346: Support explicit file/archive delivery in project task delegation, pin selections in durable dispatch intents and reject changed selections on replay. Share the delivery schema through contracts while preserving SDK exports. Reject wildcard paths before delegation and retain evidence-only review confinement.
- 98a7367: Add the versioned thread activity snapshot contract. Persist background Runtime
  continuation streams and expose authorized conversation discovery. Emit task and
  delegation resource cards into their owning messages and project current states
  without querying the Coding CLI from each viewer.
- 2858f0a: Add provider-scoped extensions for runtime work-area resolution. Host modules can
  map authorized project paths into an existing runtime without coupling shared
  Agent and conversation code to a specific runtime implementation. Keep default
  path mappings when no extension applies, propagate authorization errors and preserve
  passive lookups without filesystem creation.

    Centralize sandbox target selection for Agent invocation and conversation access:
    an explicitly selected environment takes precedence over project and user bindings.
    Keep this policy in the Sandbox layer, independent of the work area's storage and
    path mappings. Project files remain in their project volume when execution uses a
    separate environment, and active acquisition and passive lookup use the same target.

### Patch Changes

- d18aa7f: Allow up to 128 exact relative file paths in explicit Agent output deliveries, for
  both individual files and archives. Keep relative-path validation and wildcard
  rejection unchanged.

    Extract the existing 10 MiB Assistant workspace upload limit into a shared server
    constant so runtime adapters can reuse it without depending on the HTTP controller.
    This does not change upload size or workspace access checks.

- b86bba1: Add resumable personal Bosi onboarding with tenant, organization and user isolation, private workspace preparation, workspace service connections, capability-aware model selection and recoverable template installation. Reuse existing Assistant bindings and persist initialization and welcome progress.

    Add authorized public Assistant name and avatar updates, a Desktop appearance studio with configurable characters, uploaded images and pets, and ChatKit appearance and computer controls. Preserve published configuration when saving profile fields and keep Assistant capability changes behind explicit settings saves.

- bf33018: Make managed background Coding CLI permissions configurable through the existing
  tenant model execution policy, defaulting to allow with per-tool restricted
  overrides. Pin the selected mode in runner receipts and keep evidence-only review
  restrictions. Advertise supported modes in CLI profiles; leave interactive and
  managed shell sessions unchanged.
- b66bdcc: Render Coding Execution View as a compact WebTUI-style transcript with host, paper, charcoal and midnight themes. Preserve Activity nodes, text selection, focus, disclosures and paused scrolling across incremental updates. Add loaded-output search and keyboard navigation, deduplicate SDK result summaries, and retain existing scoped downloads and execution mechanisms.

    Use shared shadcn Button, Badge and Select components for the host-themed header, and scale transcript typography with the relative text-sm size.

- aa33949: Show bundled Coding CLI brand logos in execution headers, project task/attempt views and resource cards. Prefer published color variants, retaining monochrome when unavailable. Project graphs expose authorized executor identity, keeping the latest implementation separate from review attempts and preserving registered business icons. Unknown tools retain generic icons; status, execution and collection mechanisms remain unchanged.

    Keep brand assets, licenses and the React component together in shadcn-ui/brand-icons. Provide a React-free data entry for server resource cards; Coding runtime identity mapping stays in its domain adapter.

- d4dba33: Add the Conversation Map data and action services with authorized Assistant-family pagination, visible message search, branch-aware summaries, and typed branch titles. Reuse existing conversation creation, rename, branch, and navigation services, and return the existing side chat on request retries even after its source starts another run.
- 01fd502: Add the on-demand Conversation Map Workbench View with shared shadcn controls, React Flow layouts, searchable conversation and branch navigation, and host-backed display preferences. Include compact directory rows, content-sized cards, accessible action tooltips, and reproducible source builds.

    Use `agent.workbench` as the canonical Assistant Workbench slot. Normalize legacy `agent.workbench.fixed` and `agent.workbench.main` requests and plugin declarations at the host boundary, preserving authorization and opening preferences without duplicate views.

- deff039: Add persisted conversation Resource Cards, the public emitResourceCard helper and optional transactional Project creation receipts. Cards use typed Workbench navigation without changing file Artifacts. Scheduler creation now emits a receipt and offers an on-demand, authorized detail/edit/history View. ChatKit and Xpert SDK companion releases are required for the UI; publish public contracts/SDK before consuming plugins.

    Opening an Assistant Project target with a View now opens a separately scoped host tab, retaining the current conversation, composer and ChatKit mount. The target Project is authorized independently, and its View scope survives refresh and browser history. Explicit Project selection without a View retains its existing workspace-switch behavior.

- 1748ad6: Download authorized execution files in Desktop through the signed-in host session. Preserve grant ownership, organization and resource checks, reject redirects and keep existing files intact on cancelled or interrupted downloads. Web cookie-based downloads remain supported.
- ada086b: Declare jsdom as a direct Desktop development dependency so isolated installer builds can run the renderer tests without relying on transitive server dependencies. Regenerate the Desktop dependency lock for reproducible CI installs.

    Use ES2020-compatible quote escaping for execution usage CSV exports so the Web production build succeeds without raising its browser library target.

    Exclude test-support directories from the server-ai production compilation so Jest mocks remain available to tests without entering API build output.

- b66bdcc: Add optional invocation activity capture and an independent Coding Execution View. Persist scoped, resumable public CLI activity and private bounded output archives; unify direct runtime cards and project execution navigation without coupling collection to task acceptance.
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

- c941907: Define versioned Project Task execution specifications, implementation/review purposes, evidence references and distinct invocation receipts. Add host-validated Runtime message provenance, reply metadata, progress observations and shared event/consumption identities.

    This is the contract stage only. Durable Project Task dispatch, outbox/inbox consumers and automatic result delivery are not enabled by these declarations. Deploy compatible contracts, SDK and host before producing the new Runtime envelopes.

    Use the published `@xpert-ai/chatkit-types` 0.11.1 package and declare the contracts package's Zod peer dependency. Host UI package upgrades follow with the live conversation integration.

- 5878449: Use the project root as the default business working directory across Assistants while preserving separate assistant memory and conversation namespaces.
- c0dd14c: Add provider-registered business task types with localized labels and controlled Lucide icon tokens. Persist taskType in the existing type column, preserve legacy values, and resolve presentation independently of hierarchy, status and assignee. Project Tasks list, tree, Gantt, board and detail views share one icon renderer. No database migration is required.
- 6f8dc10: Show task details in a centered, responsive Dialog while preserving unsaved plan confirmation and focus restoration. Use the host's densityRootFontSize theme token for the task view's HTML root, with a 14px fallback.
- 3142346: Generate Project Task dispatch and decision idempotency keys in the host tool layer from scoped tool-call identity instead of requiring model-generated UUIDs. Preserve keys across replay and Agent run reconstruction, reject missing identity and model overrides, and retain existing service conflict checks and durable recovery records.
- 00db21e: Use normal tool steps for project task creation and updates, reserving conversation resource cards for actual execution attempts. Display validated independent review verdicts and readable executor names, and guide Agents to keep technical identifiers out of ordinary replies.
- 3185f56: Add explicit, revision-bound Project Task acceptance and rework decisions. Bind decisions to the current implementation, specification, and result or Artifact versions; keep retries idempotent and reject completion through generic task updates. Once independent review is requested, acceptance requires the latest valid passing review for that implementation.

    Expose runtime progress, delivery and consumption, review reports, decision history, and authorized human controls in Tasks & Timeline. OS provides the shared review protocol and validation; the current review dispatch gate requires the Computer OpenCode executor supplied by Pro. This batch does not include Computer execution, live conversation streams, or message cards.

    Apply `20261006-project-task-decisions.sql` after the task association and reliable reply migrations. Validation covers local tests and isolated PostgreSQL; it does not represent live model or CLI acceptance.

- 91953ce: Rename the task Workbench entry to Project tasks. Keep view tabs and responsive actions within the panel, add drag-to-pan scrolling for task tables and Gantt, and support time-axis zoom independently of hour/day/week granularity.

    Keep the pinned Gantt column header opaque so timeline labels do not show through it during horizontal scrolling.

- 55ec356: Add typed ModelRequest.requirements and mergeModelRequirements for per-call capability requirements, initially supporting ModelFeature.VISION. The host validates and snapshots middleware contributions, unions requirements across the call chain, and checks each invoked model including fallbacks. Required capabilities cannot silently degrade or substitute a static response. Calls without requirements retain existing behavior. Generic multimodal ToolNode support remains deferred.
- 00db21e: Add optional ResourceCardProvider registration and batched, read-only card resolution to the plugin SDK. Dispatch live conversation card updates through a single host handler with scoped provider lookup, resource identity validation and isolated deadlines. Migrate project task cards to this provider path while keeping unregistered types as saved snapshots. Keep initial project card construction and refreshed presentation together in ProjectTaskCardProvider.
- fffb0f4: Add the scoped `ToolImagesRuntimeCapability` for immutable tool image references and temporary verified model input. Bind storage and Artifact access to the current host conversation, enforce complete tool rounds and checksum validation, and keep image bytes out of tool messages and checkpoints. Legacy image-tool history is sanitized only in outbound request copies.
- 6f8dc10: Open task execution views within the current Agent Workbench without switching project/chat sessions. Preserve project-page navigation and the separate owner-conversation action.
- 6f8dc10: Separate task delivered files from execution history and acceptance controls. Read committed artifacts and export errors from the existing authorized task detail response instead of the legacy output summary.

    Render JSON replies and historical results as per-node expandable object/array trees in the Coding Execution View, retaining original-text copy, deep search, keyboard navigation and stable expansion/focus/selection across updates without relaxing result validation or changing execution behavior.

- 00db21e: Separate generic thread activity discovery from project task card projection through a typed CQRS command. Keep task permissions, invocation ownership checks and review verdict interpretation in the project module without changing the activity stream or card protocol.
- a131790: Add optional message anchors and originating-view preservation to Workbench conversation navigation contracts. The navigation resolver accepts an exact thread and message, validates thread ownership and visible user/assistant message membership, and retains the default thread behavior for older requests. Validate optional anchors at the HTTP boundary before resolving access.
- Updated dependencies [d18aa7f]
- Updated dependencies [b86bba1]
- Updated dependencies [a01cd48]
- Updated dependencies [1df94f0]
- Updated dependencies [bf33018]
- Updated dependencies [bf33018]
- Updated dependencies [b86bba1]
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
- Updated dependencies [b86bba1]
- Updated dependencies [55ec356]
- Updated dependencies [00db21e]
- Updated dependencies [fffb0f4]
- Updated dependencies [b86bba1]
- Updated dependencies [49b60d4]
- Updated dependencies [d81dbe2]
- Updated dependencies [a131790]
    - @xpert-ai/contracts@3.20.0
    - @xpert-ai/plugin-sdk@3.20.0
    - @xpert-ai/cli-model-profiles@0.2.0
    - @xpert-ai/shadcn-ui@0.2.1
    - @xpert-ai/server-core@3.10.1
    - @xpert-ai/desktop-protocol@0.2.1

## 3.10.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 1e44173: Upgrade ChatKit UI to 0.5.13 and align ChatKit types on 0.5.9 across the host packages. Include the released history loading, reasoning, composer file selector, and plugin-provided approval presentation improvements.
- b62543f: Add editable prompt workflow scenarios, organization tags, expert associations, and expert-scoped capability selections. Refresh prompt management and command availability, preserve explicit field clearing, and send expanded editable prompts without expanding them again on the server.

    Requires the ChatKit types and UI release that introduces prompt scenarios and editable prompt drafts; update the host's ChatKit dependencies to that published release before shipping.

- bb24b02: Associate newly initialized template prompt workflows with the expert created from that template in both import and plugin installation flows. Preserve existing same-name workflows and their user-defined associations.

    Track template provenance to associate repeated installations with each created expert without changing user-owned, archived or global prompts. Initialize template prompts after publishing succeeds so failed installations leave no stale associations.

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
    - @xpert-ai/server-core@3.10.0
    - @xpert-ai/server-auth@3.10.0
    - @xpert-ai/server-common@3.10.0
    - @xpert-ai/server-config@3.10.0
    - @xpert-ai/desktop-protocol@0.2.0
    - @xpert-ai/shadcn-ui@0.2.0

## 3.9.38

### Patch Changes

- Updated dependencies [5213185]
    - @xpert-ai/plugin-sdk@3.18.7
    - @xpert-ai/server-core@3.9.53

## 3.9.37

### Patch Changes

- 9a2a2a0: Transcribe scanned pages through the existing image-understanding model, retain page order, skip embedded placeholder pixels, invalidate older image results, and display localized image-recognition notices.
- 089e3ff: Accept upload formats advertised by registered parsers, process plugin-converted spreadsheets as document text, preserve shared processing settings, and translate bounded parser errors including unsupported CSV encoding.
- 4bc3aa0: Add managed offline Node and Java document Runtime profiles, pinned conversion and OCR dependencies, PDF page rendering, and serialized health probes with bounded failure caching.
- Updated dependencies [9a2a2a0]
- Updated dependencies [a8a251d]
- Updated dependencies [089e3ff]
- Updated dependencies [983b730]
    - @xpert-ai/contracts@3.18.6
    - @xpert-ai/plugin-sdk@3.18.6
    - @xpert-ai/server-core@3.9.52

## 3.9.36

### Patch Changes

- 6a51c17: Add a shared knowledge document language hint and bounded, model-free language detection for natural text chunk boundaries. Preserve Auto strategy routing, explicit separators, token limits, and parent-child behavior, and expose the requested and detected languages in chunk previews.
- 95ec638: Add asynchronous knowledgebase automatic tagging with bounded document samples, numbered existing-label classification, strict server validation, model fallback, and idempotent incremental associations. Reuse organization/tenant Tag definitions with knowledgebase-scoped selection and preserve manual labels across concurrent classification and retries. Count explicit knowledge associations in the existing directory and protect referenced tags. Run standalone schema-sync before enabling the new code.
- Updated dependencies [6a51c17]
- Updated dependencies [95ec638]
- Updated dependencies [8402f72]
    - @xpert-ai/contracts@3.18.5
    - @xpert-ai/plugin-sdk@3.18.5
    - @xpert-ai/server-core@3.9.51

## 3.9.35

### Patch Changes

- 7b97fee: Restore knowledge pipeline source selection and previews, refresh documents immediately after saving, and track background processing failures. Persist imported documents and task bindings atomically, and prevent stale failure callbacks from overwriting a newer document execution.
- 4c0f6d5: Authorize published assistant access for technical API principals using their owning user's permissions. Preserve the technical execution identity, file ownership, explicit user delegation, and credential audience boundaries.
- Updated dependencies [3f72082]
- Updated dependencies [7b97fee]
- Updated dependencies [4be390b]
- Updated dependencies [63cd444]
- Updated dependencies [4e8c7ed]
    - @xpert-ai/contracts@3.18.4
    - @xpert-ai/plugin-sdk@3.18.4
    - @xpert-ai/server-core@3.9.50

## 3.9.34

### Patch Changes

- Updated dependencies [d107704]
    - @xpert-ai/contracts@3.18.2
    - @xpert-ai/plugin-sdk@3.18.3
    - @xpert-ai/server-core@3.9.49

## 3.9.33

### Patch Changes

- Updated dependencies [e260743]
    - @xpert-ai/plugin-sdk@3.18.2
    - @xpert-ai/contracts@3.18.1
    - @xpert-ai/server-core@3.9.48

## 3.9.32

### Patch Changes

- Updated dependencies [a86016e]
    - @xpert-ai/plugin-sdk@3.18.1
    - @xpert-ai/server-core@3.9.47

## 3.9.31

### Patch Changes

- Updated dependencies [477b711]
- Updated dependencies [dad112d]
- Updated dependencies [8e63a8b]
- Updated dependencies [1c71b75]
- Updated dependencies [d45a0c8]
    - @xpert-ai/plugin-sdk@3.18.0
    - @xpert-ai/contracts@3.18.0
    - @xpert-ai/server-core@3.9.46

## 3.9.30

### Patch Changes

- Updated dependencies [afb69b7]
    - @xpert-ai/contracts@3.17.6
    - @xpert-ai/plugin-sdk@3.17.6
    - @xpert-ai/server-core@3.9.45

## 3.9.29

### Patch Changes

- Updated dependencies [9e59e41]
    - @xpert-ai/contracts@3.17.5
    - @xpert-ai/plugin-sdk@3.17.5
    - @xpert-ai/server-core@3.9.44

## 3.9.28

### Patch Changes

- Updated dependencies [7b6954a]
    - @xpert-ai/plugin-sdk@3.17.4
    - @xpert-ai/contracts@3.17.4
    - @xpert-ai/server-core@3.9.43

## 3.9.27

### Patch Changes

- Updated dependencies [754866e]
    - @xpert-ai/plugin-sdk@3.17.3
    - @xpert-ai/contracts@3.17.3
    - @xpert-ai/server-core@3.9.42

## 3.9.26

### Patch Changes

- Updated dependencies [fa1306a]
    - @xpert-ai/contracts@3.17.2
    - @xpert-ai/plugin-sdk@3.17.2
    - @xpert-ai/server-core@3.9.41

## 3.9.25

### Patch Changes

- Updated dependencies [612baea]
    - @xpert-ai/contracts@3.17.1
    - @xpert-ai/plugin-sdk@3.17.1
    - @xpert-ai/server-core@3.9.40

## 3.9.24

### Patch Changes

- Updated dependencies [3c16d3a]
- Updated dependencies [747732e]
- Updated dependencies [e44e5bc]
    - @xpert-ai/server-core@3.9.39
    - @xpert-ai/plugin-sdk@3.17.0
    - @xpert-ai/contracts@3.17.0

## 3.9.23

### Patch Changes

- Updated dependencies [57721a6]
    - @xpert-ai/plugin-sdk@3.16.1
    - @xpert-ai/server-core@3.9.38

## 3.9.22

### Patch Changes

- Updated dependencies [b800da5]
    - @xpert-ai/plugin-sdk@3.16.0
    - @xpert-ai/contracts@3.16.0
    - @xpert-ai/server-core@3.9.37

## 3.9.21

### Patch Changes

- Updated dependencies [2f6bf18]
    - @xpert-ai/contracts@3.15.18
    - @xpert-ai/plugin-sdk@3.15.18
    - @xpert-ai/server-core@3.9.36
    - @xpert-ai/copilot@3.9.33

## 3.9.20

### Patch Changes

- Updated dependencies [0a90701]
    - @xpert-ai/plugin-sdk@3.15.17
    - @xpert-ai/contracts@3.15.17
    - @xpert-ai/server-core@3.9.35
    - @xpert-ai/copilot@3.9.32

## 3.9.19

### Patch Changes

- 90a268b: Initialize assistant template prompt workflows as reusable workspace commands.
- Updated dependencies [90a268b]
    - @xpert-ai/contracts@3.15.16
    - @xpert-ai/plugin-sdk@3.15.16
    - @xpert-ai/copilot@3.9.31
    - @xpert-ai/server-core@3.9.34

## 3.9.18

### Patch Changes

- 8a0eba3: Calculate membership points proportionally, constrain tokens-per-point settings to safe presets, expose non-duplicated point usage by runtime organization in Copilot usage summaries, and support tiered model pricing.
- e3d3c26: Add a machine-readable stale steer callback error and close the execution-completion race before channel follow-ups are persisted.
- Updated dependencies [a26a776]
- Updated dependencies [8a0eba3]
- Updated dependencies [5d4a308]
- Updated dependencies [e3d3c26]
    - @xpert-ai/plugin-sdk@3.15.15
    - @xpert-ai/contracts@3.15.15
    - @xpert-ai/server-core@3.9.33
    - @xpert-ai/copilot@3.9.30

## 3.9.17

### Patch Changes

- Updated dependencies [8a46f00]
    - @xpert-ai/contracts@3.15.14
    - @xpert-ai/copilot@3.9.29
    - @xpert-ai/plugin-sdk@3.15.14
    - @xpert-ai/server-core@3.9.32

## 3.9.16

### Patch Changes

- 25664c9: Persist and aggregate conversation task summaries and enable the responsive summary card with resource opening in ClawXpert.
- Updated dependencies [25664c9]
- Updated dependencies [b269a84]
    - @xpert-ai/contracts@3.15.13
    - @xpert-ai/plugin-sdk@3.15.13
    - @xpert-ai/copilot@3.9.28
    - @xpert-ai/server-core@3.9.31

## 3.9.15

### Patch Changes

- Updated dependencies [b8bac1f]
- Updated dependencies [b905a58]
    - @xpert-ai/contracts@3.15.12
    - @xpert-ai/plugin-sdk@3.15.12
    - @xpert-ai/copilot@3.9.27
    - @xpert-ai/server-core@3.9.30

## 3.9.14

### Patch Changes

- Updated dependencies [aa16ee9]
    - @xpert-ai/plugin-sdk@3.15.11
    - @xpert-ai/contracts@3.15.11
    - @xpert-ai/server-core@3.9.29
    - @xpert-ai/copilot@3.9.26

## 3.9.13

### Patch Changes

- Updated dependencies [c9d8401]
    - @xpert-ai/plugin-sdk@3.15.10
    - @xpert-ai/contracts@3.15.10
    - @xpert-ai/server-core@3.9.28
    - @xpert-ai/copilot@3.9.25

## 3.9.12

### Patch Changes

- Updated dependencies [601438f]
    - @xpert-ai/plugin-sdk@3.15.9
    - @xpert-ai/contracts@3.15.9
    - @xpert-ai/server-core@3.9.27
    - @xpert-ai/copilot@3.9.24

## 3.9.11

### Patch Changes

- 7ab7aa1: Add connector contracts, management UI, runtime APIs, and connector middleware support.
- Updated dependencies [7ab7aa1]
- Updated dependencies [121ced0]
    - @xpert-ai/contracts@3.15.8
    - @xpert-ai/plugin-sdk@3.15.8
    - @xpert-ai/copilot@3.9.23
    - @xpert-ai/server-core@3.9.26

## 3.9.10

### Patch Changes

- Updated dependencies [5e553ae]
    - @xpert-ai/plugin-sdk@3.15.7
    - @xpert-ai/server-core@3.9.25

## 3.9.9

### Patch Changes

- Updated dependencies [3249145]
    - @xpert-ai/plugin-sdk@3.15.6
    - @xpert-ai/contracts@3.15.7
    - @xpert-ai/server-core@3.9.24
    - @xpert-ai/copilot@3.9.22

## 3.9.8

### Patch Changes

- Updated dependencies [0473ce2]
    - @xpert-ai/plugin-sdk@3.15.5
    - @xpert-ai/contracts@3.15.6
    - @xpert-ai/server-core@3.9.23
    - @xpert-ai/copilot@3.9.21

## 3.9.7

### Patch Changes

- Updated dependencies [693806f]
    - @xpert-ai/plugin-sdk@3.15.4
    - @xpert-ai/contracts@3.15.5
    - @xpert-ai/server-core@3.9.22
    - @xpert-ai/copilot@3.9.20

## 3.9.6

### Patch Changes

- Updated dependencies [bdcb73b]
    - @xpert-ai/plugin-sdk@3.15.3
    - @xpert-ai/contracts@3.15.4
    - @xpert-ai/server-core@3.9.21
    - @xpert-ai/copilot@3.9.19

## 3.9.5

### Patch Changes

- Updated dependencies [481ffba]
    - @xpert-ai/plugin-sdk@3.15.2
    - @xpert-ai/contracts@3.15.3
    - @xpert-ai/server-core@3.9.20
    - @xpert-ai/copilot@3.9.18

## 3.9.4

### Patch Changes

- Updated dependencies [8fded17]
    - @xpert-ai/plugin-sdk@3.15.1
    - @xpert-ai/contracts@3.15.2
    - @xpert-ai/server-core@3.9.19
    - @xpert-ai/copilot@3.9.17

## 3.9.3

### Patch Changes

- Updated dependencies [c1e4da2]
    - @xpert-ai/plugin-sdk@3.15.0
    - @xpert-ai/contracts@3.15.1
    - @xpert-ai/server-core@3.9.18
    - @xpert-ai/copilot@3.9.16

## 3.9.2

### Patch Changes

- Updated dependencies [6f679b8]
    - @xpert-ai/plugin-sdk@3.14.0
    - @xpert-ai/contracts@3.15.0
    - @xpert-ai/server-core@3.9.17
    - @xpert-ai/copilot@3.9.15

## 3.9.1

### Patch Changes

- Updated dependencies [54cff15]
- Updated dependencies [6978bfd]
    - @xpert-ai/plugin-sdk@3.13.0
    - @xpert-ai/contracts@3.14.0
    - @xpert-ai/server-core@3.9.16
    - @xpert-ai/copilot@3.9.14

## 3.9.0
