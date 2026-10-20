# @xpert-ai/xpert-ui

## 3.25.0

### Minor Changes

- 3e0460d: Align the core platform packages on a shared release line. API, Cloud, Contracts, SDK and server foundations move together to the next minor version.

### Patch Changes

- babce0b: Return typed errors for disallowed or unavailable Assistant model selections. Preserve failed execution and thread error details while releasing the run claim after admission rejection.
- c2b52ba: Include Assistant runtime dependency compatibility in application releases. Ordinary plugin updates produce non-blocking recommendations while unavailable dependencies and explicit version requirements retain actionable runtime errors.
- ba77738: Allow compatible ChatKit patches within the current minor line and provide an explicit dependency refresh command that keeps workspace and deployment locks aligned. Docker builds continue to use frozen locks.
- 4ff6010: Use the resolved model context window consistently for primary calls and context compression. Preserve explicit provider limits and remove model-name guesses that can incorrectly reject summary input for custom endpoints.
- cfb0181: Prevent JSON Schema array add buttons from submitting their containing form, including MCP service configuration forms. Adding an item now leaves the form editable until the user saves it.
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

## 3.21.1

### Patch Changes

- 2e7af88: Include the shared MCP Client Runtime SDK capability in application releases. The API provides governed read-only tool discovery and calls using existing connections, current-viewer authorization and pinned schema contracts.

## 3.21.0

### Minor Changes

- c4f9bb3: Add organization member sharing and scoped user-group authorization for Assistants. Separate resource sharing from organization group management, enforce active organization membership and runtime-only grants, and keep access changes consistent across published versions.

  Use the existing Zard UI theme for the sharing page and hide group authorization when the account cannot view organization user groups.

### Patch Changes

- 02345e3: Upgrade all shared ChatKit packages to 0.16.0 and align workspace, API, Web, and Desktop dependency locks. Include floating Workbench chat, image reference thumbnails, and the latest message interaction and workspace preview improvements.
- c5299e6: Align tag-select fields, selected chips and suggestions with the shared theme and compact input density. Keep Assistant sharing buttons at a consistent page-local height with responsive alignment.
- 2e488be: Manage data retention exclusively from the default tenant and apply its cleanup switches and retention periods to all tenants. Ignore other tenants' previous retention overrides, preserve conversation references and pending settlements, and retain model usage facts when removing expired call records. Only default-tenant SuperAdmins can change these global policies; missing or disabled default policies do not trigger cleanup.

  Keep retention parameters out of the generic tenant settings editor and only display saved changes after the request succeeds. Failed saves preserve the original value and editable draft and show an error.

## 3.20.5

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
- 94dd967: Run one-click official Agent plugin imports as background jobs so large catalogs no longer keep a single HTTP request open. Persist progress per tenant and organization, show incremental results, and resume the same Git snapshot after page reloads or API restarts without repeating completed imports. Duplicate requests reuse the running job, and partial package failures remain visible.
- 616bab6: Add an optional group identifier to the Workbench runtime scope and resolve group views through the authorized group context API. Keep views bound to the resolved Assistant and conversation, ignore stale responses when switching groups, and avoid falling back to personal views while group context is loading.
- 616bab6: Add the SandboxWorkspaceMount contract and optional workspaceMounts provider creation option for mounts resolved after application authorization. Include conversation scope in application-side Sandbox acquisition and cache identity without forwarding business authorization context to providers.
- 616bab6: Move Assistant template requirements from the installation dialog to a dedicated tab on the template detail page. Load requirements in the selected organization scope, support retry after loading failures, and link installation users to the detail page for dependency setup.

## 3.20.4

### Patch Changes

- 4e29238: Resolve Agent Plugin connector definitions from persisted tenant and organization configuration so catalogs, OAuth callbacks and runtime calls work across API replicas and restarts. Preserve historical connector identities and authentication methods when a native provider replaces generic MCP OAuth.

  Allow supported connectors to select or create a system integration in the connection dialog, remember its ID for reconnects, and resolve application credentials using the connection's persisted scope. Generate integration names automatically and deduplicate retries. GitHub requires the companion GitHub Connector plugin update to expose this flow and replace dynamic client registration.

- 3b7f2cd: Extend the existing api_key table and authentication flow with USER-bound personal keys in account settings, with one-time secret display, hashed storage, expiration and revocation. Use the same endpoints and authentication flow as existing API keys, restoring the personal key's human owner and current permissions. Preserve ordinary login-only management endpoints and the existing resource-key and ChatKit session flows; no personal-key-specific route opt-in is required.

  Instances that tested the separate-table draft can preserve those credentials with the one-time `packages/server/src/api-key/personal-api-key/migrate-personal-api-keys.sql` script after schema synchronization.

## 3.20.3

### Patch Changes

- f60db7b: Exclude expired and unready replica registrations from plugin rollouts, validate returning replicas before admitting traffic, and restart one candidate at a time. Preserve healthy peers on failure, add bounded plugin startup diagnostics and an event-loop-independent watchdog, and restore verified last-known-good plugin configurations without retrying failed recovery indefinitely.

  Protect the last healthy replica unless an authorized operator explicitly permits downtime. Pin replacement admission to the active generation's cumulative plugin manifest so queued updates cannot block the current rollout or inherit outage consent.

- 558b1cd: Add provider model discovery and incremental imports for LLM, embedding, and rerank models. Preserve edited configuration across synchronization, expose model sources and editable limits, and apply the synchronized catalog to model selection and execution access.

## 3.20.2

### Patch Changes

- e42fc94: Make tenant and organization Agent Plugin installations directly available in the ChatKit Plugins menu. Remove workspace publishing and addition from Cloud and Desktop, prepare selected runtime resources on demand, and retain existing conversation versions, expert mappings and Connector configuration.

  Tenant packages inherit into organizations without sharing Connector credentials. Existing databases created with the original Agent Plugin SQL schema should apply `20261012-agent-plugin-installation-scope.sql` to allow tenant-scoped records.

- 7de8eae: Update ChatKit packages to 0.14.2 to preserve pending project confirmation when restoring conversations, and synchronize the API, Web and Desktop deployment lockfiles.
- 02f3081: Release API and Web application images alongside the shared ClawXpert initialization recovery contracts and MCP App history / View runtime plugin SDK updates. Keep both application images aligned with the updated shared packages.
- f816d25: Update the ChatKit packages consumed by Xpert to 0.14.1 and synchronize the API, Web and Desktop deployment lockfiles.

## 3.20.1

### Patch Changes

- 75f1cd3: Support browser microphone recording with optional shared tab audio through declared View client commands and a host permission dialog. Produce independent 24 kHz PCM WAV chunks, preserve ordered retryable delivery in page memory, and carry the initiating View runtime scope to event and file actions. Add translated source selection and upload-lifetime guidance.

  Keep capture state and controls scoped to the initiating identity, View and Project, respect capture ID selection, and stop on device loss, scope changes or recording limits. Confirm meeting creation before starting capture, release devices on failed or cancelled startup, and preserve the final audio block before the stopped event. Add regression coverage for permission cleanup, delivery retries, scope changes, PCM processing and browser/native command separation.

- ae1fb5f: Add scoped knowledgebase discovery, readiness and action-permission APIs with authorization-aware cursor pagination. Preserve the legacy list behavior with deprecation guidance, and fail indexing when supplied generated-image semantics are invalid instead of indexing placeholder content.

  Clarify runtime and provisioning API responsibilities, and organize the SDK guides into English documentation with updated navigation, branding, package assets and cross-references.

- e55a7dc: Improve application marketplace cards in Web and Desktop with full-bleed previews, app logos and compact translucent glass overlays. Reveal descriptions and actions on hover or keyboard focus, keep them available on touch devices, and size cards to prevent internal vertical scrolling or clipped actions at narrow widths. Use fixed-size panels with transform animations and matching loading placeholders.

  Preserve validated image, SVG and emoji application icons in the Desktop catalog and setup details, provide preview and logo fallbacks, and show publisher and tag information in application details. Add catalog regression coverage for supported icons and rejected URLs.

- 9286a0f: Refine marketplace application cards with theme-aware translucent gradients, compact logos, and cover-aligned blur layers that stay aligned while details expand. Improve dark-theme text contrast and keep the web card glass independent of backdrop sampling.

## 3.20.0

### Minor Changes

- 4fff330: Upgrade the shared ChatKit packages to 0.13.0 across Cloud, Desktop and server-side chat contracts, keeping workspace and deployment dependency locks aligned.

  Support shared group conversations with human and digital expert participants through the existing ChatKit chat, composer, header and workbench. Include participant-aware messages, member management and links to digital expert execution conversations, along with the new-tab workbench fallback and model names in context usage information.

### Patch Changes

- eecb9fa: Configure required builtin toolsets when enabling marketplace applications. Discover and deduplicate template dependencies across Assistant suites, select authorized source configurations, and provision independently managed copies before installing Assistants. Preserve toolset IDs during repair, roll back newly created copies on failure, and include them in installation health checks.

  Prepare a scoped configuration Workspace before opening toolset authorization. Persist new toolset bindings directly in that Workspace, support resuming or explicitly discarding unactivated configuration, and retain saved authorization after activation failures. Reject invalid Workspace identifiers before database access.

- f76a9c9: Let organization administrators import the official Agent plugins from one Git snapshot with a single button. Reuse existing package versions, isolate package failures, and display import results without granting workspace access. Expose the shared import command for system setup.
- c9f9379: Group Knowledge capabilities under `rag/capability` and expose resumable upload sessions through `Documents.uploads`. Support idempotent document imports without automatic processing, plus filename and folder-path search with MIME type filters so unprocessed images remain discoverable.

  Allow organizations to read public tenant libraries while requiring super administrators to explicitly select tenant scope before managing them. Keep document processing behind write-access checks without switching the caller's request scope. Release the SDK and host implementation together for the new upload API.

- c5e19d5: Make plugin runtime convergence account for registered API replicas without a fixed registration window. Retain failed rollout outcomes, guard late replica catch-up, allow authorized retirement of offline instances, and synchronize organization plugin removals. Hide manual restart prompts from non-SuperAdmin users while retaining background progress.
- 5aa4692: Ship official Agent plugin imports and resumable plugin installation during system setup in the API and Web application images. Include the shared contracts, plugin SDK, and server changes required by these features.
- 4b7a346: Add plugin installation as the final system setup step, with a paginated marketplace catalog, plugin details, filters, grouping, and selection across pages using Zard UI. Install selected plugins sequentially, skip failures, optionally import the official Agent plugins, and defer runtime activation until the batch finishes. Persist installation progress, resume interrupted work, and enter the organization only after runtime convergence completes.

## 3.19.1

### Patch Changes

- b86bba1: Add resumable personal Bosi onboarding with tenant, organization and user isolation, private workspace preparation, workspace service connections, capability-aware model selection and recoverable template installation. Reuse existing Assistant bindings and persist initialization and welcome progress.

  Add authorized public Assistant name and avatar updates, a Desktop appearance studio with configurable characters, uploaded images and pets, and ChatKit appearance and computer controls. Preserve published configuration when saving profile fields and keep Assistant capability changes behind explicit settings saves.

- b86bba1: Keep scoped Assistant Views open across conversation and Project context changes, and support authorized native file and terminal access. Ship the resource-card, task-type, Assistant appearance and capability settings interfaces with the shared ChatKit 0.10.0 integration.

  Include external API calls in usage views, add execution filters and exports, and present personal consumption as integer points. Fix edited PowerPoint shape serialization and model name editing.

- ada086b: Declare jsdom as a direct Desktop development dependency so isolated installer builds can run the renderer tests without relying on transitive server dependencies. Regenerate the Desktop dependency lock for reproducible CI installs.

  Use ES2020-compatible quote escaping for execution usage CSV exports so the Web production build succeeds without raising its browser library target.

  Exclude test-support directories from the server-ai production compilation so Jest mocks remain available to tests without entering API build output.

- b86bba1: Add execution-scoped model grants, protocol bridges, CLI launchers, budget enforcement, attributed usage settlement and audited reconciliation. Expose the native model SDK and scoped host runner capability, and accept CLI prompt-cache hints without forwarding provider credentials to execution environments.

  Add typed Agent execution results, authorized file delivery and bounded task observation. Preserve background execution during logout, centralize conversation file access, retain explicit Assistant middleware configuration, and allow validated text-only receipts from image-capable tools. Include the API and Web releases required by these shared contracts and runtime changes.

- 91953ce: Rename the task Workbench entry to Project tasks. Keep view tabs and responsive actions within the panel, add drag-to-pan scrolling for task tables and Gantt, and support time-axis zoom independently of hour/day/week granularity.

  Keep the pinned Gantt column header opaque so timeline labels do not show through it during horizontal scrolling.

- b86bba1: Preserve host-provided root font size and corner-radius variables in remote Views. Make shared React theme utilities prefer the corresponding host radius values and clamp fallback radii so compact themes remain valid.

## 3.19.0

### Minor Changes

- e4485ba: Release Bosi Desktop, API and Webapp together for configurable digital experts.

  Bosi can create blank assistants and edit their model, optional capabilities and instructions. Personal profile overrides remain local, while shared assistant settings require workspace edit access and take effect after publishing.

  Add an extensible Assistant capability registry, model and runtime compatibility checks, and configuration APIs with stale-edit protection. Keep cloud computer support in the Pro capability provider, and preserve existing workflow settings when managed capabilities change.

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 79cc75a: Publish application Docker images only for their own Changesets. Build scoped candidates, require consumed Changesets for stable releases, and check that shared package releases include their consuming applications.
- ce73ebe: Upgrade the shared ChatKit packages to 0.8.0 across the API, Web and Bosi desktop applications.
- 1e44173: Upgrade ChatKit UI to 0.5.13 and align ChatKit types on 0.5.9 across the host packages. Include the released history loading, reasoning, composer file selector, and plugin-provided approval presentation improvements.
- 7108a25: Publish API and Web candidates together for the shared execution-navigation contract changes.
- c953822: Support the assistant.execution Workbench navigation target and forward embedded ChatKit commands through the current view's authorized host handlers when local navigation is unavailable. Pass exact execution focus and a fresh request ID into the authorized conversation so repeated selections reopen the same record. Preserve the existing agent.workbench.fixed slot and conversation navigation compatibility.
- b62543f: Add editable prompt workflow scenarios, organization tags, expert associations, and expert-scoped capability selections. Refresh prompt management and command availability, preserve explicit field clearing, and send expanded editable prompts without expanding them again on the server.

  Requires the ChatKit types and UI release that introduces prompt scenarios and editable prompt drafts; update the host's ChatKit dependencies to that published release before shipping.

- 5f26e05: Add an opt-in frequent-question start screen using the existing question API, and expose the generic `platform.data-source.create` client command so plugins can open the host's permission-checked data source creation dialog without receiving credentials.

  The compact question list requires the ChatKit release supporting startScreen.promptsLayout.

## 3.18.6

### Patch Changes

- 9a2a2a0: Transcribe scanned pages through the existing image-understanding model, retain page order, skip embedded placeholder pixels, invalidate older image results, and display localized image-recognition notices.
- 089e3ff: Accept upload formats advertised by registered parsers, process plugin-converted spreadsheets as document text, preserve shared processing settings, and translate bounded parser errors including unsupported CSV encoding.
- 983b730: Prepare the Xpert 3.18.6 patch release, including plugin-sdk.

  Extend decorated MCP capabilities and structured knowledge graph runtime contracts.
  Improve document parsing and scanned-page understanding, semantic FAQ exclusion,
  manual tags during document import, and per-knowledgebase vector storage selection.
  Include schema-driven sliders and the scoped database workbench adapter.

  The target platform version is 3.18.6. Verify contracts, plugin-sdk, and xpert-ui
  all resolve to this version in the release version PR, including changelogs,
  internal dependency references, and lockfile entries. Publish the separately
  versioned Runtime Suite source images before creating platform-version aliases.

- 437dd75: Render schema-driven sliders with minimum, maximum, step and read-only constraints for numeric parser settings.

## 3.18.5

### Patch Changes

- 8402f72: Prepare the Xpert 3.18.5 patch release, including plugin-sdk.

  Add knowledge document chunk token limits, question generation, automatic and
  structure-aware chunking, spreadsheet table metadata, and format-specific scoped
  parsers with diagnostics. Preserve OCR chunk limits and table context.

  Extend MCP resource reads with scoped workspace files and the requested resource
  URI, preserve confirmation sessions, and reauthorize queued execution. Add PPTX
  preview and editing with binary workspace saves and edited downloads.

  The target platform version is 3.18.5. Verify contracts, plugin-sdk, and xpert-ui
  all resolve to this version in the release version PR, including changelogs,
  internal dependency references, and lockfile entries.

## 3.18.4

### Patch Changes

- 7b97fee: Restore knowledge pipeline source selection and previews, refresh documents immediately after saving, and track background processing failures. Persist imported documents and task bindings atomically, and prevent stale failure callbacks from overwriting a newer document execution.
- 4be390b: Release Xpert 3.18.4 with aligned contracts, plugin-sdk, and Web application versions.

## 3.18.1

### Patch Changes

- e260743: plugin mcp

## 3.18.0

### Minor Changes

- 8e63a8b: Release Xpert 3.18.0.

## 3.17.6

### Patch Changes

- afb69b7: Release Xpert 3.17.6 after publishing the complete Sandbox Runtime image suite.

## 3.17.5

### Patch Changes

- 9e59e41: Add stable tenant- and organization-scoped MCP publication, capability, authentication, execution context, tool result, resource, prompt, app, task, and change-event contracts for the Xpert MCP publishing platform.

  Keep plugin schema contracts on the Zod v3 compatibility API while allowing consumers to install Zod 3.25 or Zod 4.

## 3.17.3

### Patch Changes

- 7b6954a: project

## 3.17.2

### Patch Changes

- fa1306a: Add conditional LLM pricing rules, provider-reported price authority, cache and add-on components, mixed cache-write TTL pricing, recurring daily price windows frozen at invocation start, and component-aware multi-unit usage reporting for specialized models.

## 3.17.0

### Minor Changes

- 747732e: v3.17

## 3.16.0

### Minor Changes

- b800da5: v3.16

## 3.15.16

### Patch Changes

- 0a90701: release 3.15.17

## 3.15.15

### Patch Changes

- 90a268b: Initialize assistant template prompt workflows as reusable workspace commands.

## 3.15.14

### Patch Changes

- 5d4a308: Support multiple provider help links in integration configuration while preserving the legacy single-link fallback.

## 3.15.13

### Patch Changes

- 25664c9: Persist and aggregate conversation task summaries and enable the responsive summary card with resource opening in ClawXpert.

## 3.15.12

### Patch Changes

- b8bac1f: Add system-plugin Sandbox Actions, the action-oriented Sandbox Jobs Core, provider-neutral Runtime Definitions, the minimal Runtime Provider/workspace mapper SPI, Worker heartbeat health, and Browser execution-pool capability discovery.

## 3.15.11

### Patch Changes

- aa16ee9: Publish a browser-safe collaboration client entry at `@xpert-ai/plugin-sdk/collaboration-client`.

## 3.15.10

### Patch Changes

- c9d8401: collaboration & artifacts

## 3.15.9

### Patch Changes

- 601438f: fix org membership plan

## 3.15.8

### Patch Changes

- 7ab7aa1: Add connector contracts, management UI, runtime APIs, and connector middleware support.
- 121ced0: Final stable version

## 3.15.7

### Patch Changes

- 3249145: plugin artifact namespace

## 3.15.6

### Patch Changes

- 0473ce2: upgrade kb

## 3.15.5

### Patch Changes

- 693806f: workspace files

## 3.15.4

### Patch Changes

- bdcb73b: handoff messages

## 3.15.3

### Patch Changes

- 481ffba: file understanding & vector store

## 3.15.2

### Patch Changes

- 8fded17: plugin scope for tenant

## 3.15.1

### Patch Changes

- c1e4da2: managed queue

## 3.15.0

### Minor Changes

- 6f679b8: fix plugin tenant scope & human chat files types

## 3.14.0

### Minor Changes

- 54cff15: tenants and managed connections
- 6978bfd: release plugin tenant scope

## 3.13.0

### Minor Changes

- e6528c8: mcp apps

### Patch Changes

- f23228b: client commands for extension view

## 3.12.1

### Patch Changes

- 6a17eca: plugin sdk and mcp toolset close

## 3.12.0

### Minor Changes

- d017897: plugin integration guard

## 3.11.1

### Patch Changes

- 7418eef: version

## 3.11.0

### Minor Changes

- d92d0f2: upgrade zard ui

## 3.10.1

### Patch Changes

- 49101da: release

## 3.10.0

### Minor Changes

- df9d7e2: agentic app

## 3.9.9

### Patch Changes

- 2acc11a: fqa of xpert agent

## 3.9.8

### Patch Changes

- 2558760: updates

## 3.9.7

### Patch Changes

- 9e37ff9: updates

## 3.9.6

### Patch Changes

- 9a589df: browser automation & ralph loop

## 3.9.5

### Patch Changes

- 4afa718: update chatkit

## 3.9.3

### Patch Changes

- 07057a6: pet of chatkit

## 3.9.0
