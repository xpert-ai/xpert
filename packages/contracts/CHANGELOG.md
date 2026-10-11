# @xpert-ai/contracts

## 3.21.0

### Minor Changes

- 4fff330: Upgrade the shared ChatKit packages to 0.13.0 across Cloud, Desktop and server-side chat contracts, keeping workspace and deployment dependency locks aligned.

  Support shared group conversations with human and digital expert participants through the existing ChatKit chat, composer, header and workbench. Include participant-aware messages, member management and links to digital expert execution conversations, along with the new-tab workbench fallback and model names in context usage information.

### Patch Changes

- eecb9fa: Configure required builtin toolsets when enabling marketplace applications. Discover and deduplicate template dependencies across Assistant suites, select authorized source configurations, and provision independently managed copies before installing Assistants. Preserve toolset IDs during repair, roll back newly created copies on failure, and include them in installation health checks.

  Prepare a scoped configuration Workspace before opening toolset authorization. Persist new toolset bindings directly in that Workspace, support resuming or explicitly discarding unactivated configuration, and retain saved authorization after activation failures. Reject invalid Workspace identifiers before database access.

- f76a9c9: Let organization administrators import the official Agent plugins from one Git snapshot with a single button. Reuse existing package versions, isolate package failures, and display import results without granting workspace access. Expose the shared import command for system setup.
- eecb9fa: Support explicit coordinator and nested role dependencies in application Assistant suites. Validate delegation graphs, publish dependencies before callers, and include nested links in installation health checks. Repair entry-only installations in place, restore published drafts when needed, and retain scoped partial resources and all existing knowledgebase IDs for idempotent retries.
- c5e19d5: Make plugin runtime convergence account for registered API replicas without a fixed registration window. Retain failed rollout outcomes, guard late replica catch-up, allow authorized retirement of offline instances, and synchronize organization plugin removals. Hide manual restart prompts from non-SuperAdmin users while retaining background progress.
- 4b7a346: Add plugin installation as the final system setup step, with a paginated marketplace catalog, plugin details, filters, grouping, and selection across pages using Zard UI. Install selected plugins sequentially, skip failures, optionally import the official Agent plugins, and defer runtime activation until the batch finishes. Persist installation progress, resume interrupted work, and enter the organization only after runtime convergence completes.

## 3.20.0

### Minor Changes

- d18aa7f: Allow up to 128 exact relative file paths in explicit Agent output deliveries, for
  both individual files and archives. Keep relative-path validation and wildcard
  rejection unchanged.

  Extract the existing 10 MiB Assistant workspace upload limit into a shared server
  constant so runtime adapters can reuse it without depending on the HTTP controller.
  This does not change upload size or workspace access checks.

- a01cd48: Add the realtime voice model capability, model protocol adapter contract, and Bosi voice sessions. Assistant creation and settings can select an independently authorized realtime model and voice. The host relays bounded PCM audio over an authenticated, single-use-ticket WebSocket and dispatches durable Assistant tasks independently of call lifetime. Create the voice tables and timing columns through the platform's existing TypeORM entity synchronization (the schema-sync job in externally managed deployments), and configure allowed renderer origins before enabling calls. No separate realtime voice SQL migration is required.

  Introduce host-owned message envelopes with explicit source, target, correlation, and presentation for voice and future Assistant/Agent messages. Persist them in a dedicated typed `ChatMessage.messageEnvelope` JSONB column. Retain runtime execution, retry and branch history while applying consistent public-history filtering and protecting provenance from client edits. Apply the message-envelope migration before deployment.

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

- 00b626e: Separate Project Task creation from execution and add authorized Runtime discovery, explicit idempotent task dispatch, specification snapshots and task details. Persist attempts and pinned dispatch intents before launching through the existing Invocation runtime; serialize Project execution admission and preserve native handoff behavior.

  Support the built-in Project general agent as an explicit caller/reply identity. Computer invocations from this caller require a binding with an explicit `modelSource` referring to an accessible Assistant in the Project workspace; that Assistant supplies model policy, not caller identity or task ownership.

  Apply `20261006-project-task-runtime.sql` before deploying the host. This stage supports durable dispatch identity and explicit retry/inspection, but does not enable autonomous recovery scanning, reliable result messages, automatic continuation or acceptance workflows.

  Replace the legacy ProjectToolset and its creation command with the built-in `project-tasks` Middleware Plugin. Project general agents load it from the registry; Assistants can configure it through ordinary Plugin nodes and tool preferences. Preserve the six tool names while validating host-owned project/caller scope, localizing tool display metadata, and retaining Invocation status ownership.

- 3142346: Support explicit file/archive delivery in project task delegation, pin selections in durable dispatch intents and reject changed selections on replay. Share the delivery schema through contracts while preserving SDK exports. Reject wildcard paths before delegation and retain evidence-only review confinement.
- 98a7367: Add the versioned thread activity snapshot contract. Persist background Runtime
  continuation streams and expose authorized conversation discovery. Emit task and
  delegation resource cards into their owning messages and project current states
  without querying the Coding CLI from each viewer.
- a131790: Add optional message anchors and originating-view preservation to Workbench conversation navigation contracts. The navigation resolver accepts an exact thread and message, validates thread ownership and visible user/assistant message membership, and retains the default thread behavior for older requests. Validate optional anchors at the HTTP boundary before resolving access.

### Patch Changes

- b86bba1: Add resumable personal Bosi onboarding with tenant, organization and user isolation, private workspace preparation, workspace service connections, capability-aware model selection and recoverable template installation. Reuse existing Assistant bindings and persist initialization and welcome progress.

  Add authorized public Assistant name and avatar updates, a Desktop appearance studio with configurable characters, uploaded images and pets, and ChatKit appearance and computer controls. Preserve published configuration when saving profile fields and keep Assistant capability changes behind explicit settings saves.

- bf33018: Make managed background Coding CLI permissions configurable through the existing
  tenant model execution policy, defaulting to allow with per-tool restricted
  overrides. Pin the selected mode in runner receipts and keep evidence-only review
  restrictions. Advertise supported modes in CLI profiles; leave interactive and
  managed shell sessions unchanged.
- aa33949: Show bundled Coding CLI brand logos in execution headers, project task/attempt views and resource cards. Prefer published color variants, retaining monochrome when unavailable. Project graphs expose authorized executor identity, keeping the latest implementation separate from review attempts and preserving registered business icons. Unknown tools retain generic icons; status, execution and collection mechanisms remain unchanged.

  Keep brand assets, licenses and the React component together in shadcn-ui/brand-icons. Provide a React-free data entry for server resource cards; Coding runtime identity mapping stays in its domain adapter.

- d4dba33: Add the Conversation Map data and action services with authorized Assistant-family pagination, visible message search, branch-aware summaries, and typed branch titles. Reuse existing conversation creation, rename, branch, and navigation services, and return the existing side chat on request retries even after its source starts another run.
- 01fd502: Add the on-demand Conversation Map Workbench View with shared shadcn controls, React Flow layouts, searchable conversation and branch navigation, and host-backed display preferences. Include compact directory rows, content-sized cards, accessible action tooltips, and reproducible source builds.

  Use `agent.workbench` as the canonical Assistant Workbench slot. Normalize legacy `agent.workbench.fixed` and `agent.workbench.main` requests and plugin declarations at the host boundary, preserving authorization and opening preferences without duplicate views.

- deff039: Add persisted conversation Resource Cards, the public emitResourceCard helper and optional transactional Project creation receipts. Cards use typed Workbench navigation without changing file Artifacts. Scheduler creation now emits a receipt and offers an on-demand, authorized detail/edit/history View. ChatKit and Xpert SDK companion releases are required for the UI; publish public contracts/SDK before consuming plugins.

  Opening an Assistant Project target with a View now opens a separately scoped host tab, retaining the current conversation, composer and ChatKit mount. The target Project is authorized independently, and its View scope survives refresh and browser history. Explicit Project selection without a View retains its existing workspace-switch behavior.

- b66bdcc: Add optional invocation activity capture and an independent Coding Execution View. Persist scoped, resumable public CLI activity and private bounded output archives; unify direct runtime cards and project execution navigation without coupling collection to task acceptance.
- b86bba1: Add execution-scoped model grants, protocol bridges, CLI launchers, budget enforcement, attributed usage settlement and audited reconciliation. Expose the native model SDK and scoped host runner capability, and accept CLI prompt-cache hints without forwarding provider credentials to execution environments.

  Add typed Agent execution results, authorized file delivery and bounded task observation. Preserve background execution during logout, centralize conversation file access, retain explicit Assistant middleware configuration, and allow validated text-only receipts from image-capable tools. Include the API and Web releases required by these shared contracts and runtime changes.

- c0dd14c: Add provider-registered business task types with localized labels and controlled Lucide icon tokens. Persist taskType in the existing type column, preserve legacy values, and resolve presentation independently of hierarchy, status and assignee. Project Tasks list, tree, Gantt, board and detail views share one icon renderer. No database migration is required.
- 3185f56: Add explicit, revision-bound Project Task acceptance and rework decisions. Bind decisions to the current implementation, specification, and result or Artifact versions; keep retries idempotent and reject completion through generic task updates. Once independent review is requested, acceptance requires the latest valid passing review for that implementation.

  Expose runtime progress, delivery and consumption, review reports, decision history, and authorized human controls in Tasks & Timeline. OS provides the shared review protocol and validation; the current review dispatch gate requires the Computer OpenCode executor supplied by Pro. This batch does not include Computer execution, live conversation streams, or message cards.

  Apply `20261006-project-task-decisions.sql` after the task association and reliable reply migrations. Validation covers local tests and isolated PostgreSQL; it does not represent live model or CLI acceptance.

- d81dbe2: Allow Workbench Views to opt into conversation context updates while staying mounted, and connect exact branch and message navigation to ChatKit.

## 3.19.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 8a78318: Add explicit application Project types, provider-backed domain bindings, and typed Project provisioning/access contracts. App plugins using ProjectTypeProvider require these releases (3.19.0 or newer) and the matching host Project type endpoints/schema migration.
- 1e44173: Upgrade ChatKit UI to 0.5.13 and align ChatKit types on 0.5.9 across the host packages. Include the released history loading, reasoning, composer file selector, and plugin-provided approval presentation improvements.
- c953822: Support the assistant.execution Workbench navigation target and forward embedded ChatKit commands through the current view's authorized host handlers when local navigation is unavailable. Pass exact execution focus and a fresh request ID into the authorized conversation so repeated selections reopen the same record. Preserve the existing agent.workbench.fixed slot and conversation navigation compatibility.
- b7983c8: Add persisted knowledgebase keyword analyzer bindings and analyzer-lock state.
- 08f66e7: Allow private App workspace declarations and omitted sharing in appConfig. The matching host now creates private workspaces for application initialization and missing-workspace repair, including legacy declarations with organization sharing. Existing workspace visibility and membership remain unchanged on initialization retries and repair. Published Assistant runtime access continues to use its existing user-group and workspace-member grants.
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

## 3.18.5

### Patch Changes

- 6a51c17: Add a shared knowledge document language hint and bounded, model-free language detection for natural text chunk boundaries. Preserve Auto strategy routing, explicit separators, token limits, and parent-child behavior, and expose the requested and detected languages in chunk previews.
- 95ec638: Add asynchronous knowledgebase automatic tagging with bounded document samples, numbered existing-label classification, strict server validation, model fallback, and idempotent incremental associations. Reuse organization/tenant Tag definitions with knowledgebase-scoped selection and preserve manual labels across concurrent classification and retries. Count explicit knowledge associations in the existing directory and protect referenced tags. Run standalone schema-sync before enabling the new code.
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

- 3f72082: Add opt-in lazy template catalogs, summary pagination, explicit prompt locales and source revision tracking. Existing eager template providers remain compatible.

  Restore role skill bindings when switching templates and preserve localized skill names during installation and selection.

- 7b97fee: Restore knowledge pipeline source selection and previews, refresh documents immediately after saving, and track background processing failures. Persist imported documents and task bindings atomically, and prevent stale failure callbacks from overwriting a newer document execution.
- 4be390b: Release Xpert 3.18.4 with aligned contracts, plugin-sdk, and Web application versions.

- 4e8c7ed: Reuse ContextCompressionReason from @xpert-ai/chatkit-types while preserving TContextCompressionComponentReason as a compatible public type alias.

## 3.18.2

### Patch Changes

- d107704: Add Assistant Profile display contracts and capability/activity indicators, trusted Assistant version identities, and the feature-gated Profile tab slot. Expose static Middleware Tool names and human Project access to plugin server services, and provide the shared Zard Hover Card interaction primitive.

## 3.18.1

### Patch Changes

- e260743: plugin mcp

## 3.18.0

### Minor Changes

- 8e63a8b: Release Xpert 3.18.0.

### Patch Changes

- dad112d: Add authoritative Project View runtime scopes, membership and scheduling contracts, read/edit/manage action access, immutable Xpert workspace data scopes, scoped Connector bindings with personal or shared authorization, eligible expert providers, Project-scoped workspace files, and collaboration support.
- 1c71b75: Add Project-scoped Connector authorization and scheduled tasks that run as a confirmed Project member.
- d45a0c8: Add governed Project instructions and skills with sandbox read-only enforcement.

## 3.17.6

### Patch Changes

- afb69b7: Release Xpert 3.17.6 after publishing the complete Sandbox Runtime image suite.

## 3.17.5

### Patch Changes

- 9e59e41: Add stable tenant- and organization-scoped MCP publication, capability, authentication, execution context, tool result, resource, prompt, app, task, and change-event contracts for the Xpert MCP publishing platform.

  Keep plugin schema contracts on the Zod v3 compatibility API while allowing consumers to install Zod 3.25 or Zod 4.

## 3.17.4

### Patch Changes

- 7b6954a: project

## 3.17.3

### Patch Changes

- 754866e: Add reusable enterprise H5 identity and single-assistant session contracts.

## 3.17.2

### Patch Changes

- fa1306a: Add conditional LLM pricing rules, provider-reported price authority, cache and add-on components, mixed cache-write TTL pricing, recurring daily price windows frozen at invocation start, and component-aware multi-unit usage reporting for specialized models.

## 3.17.1

### Patch Changes

- 612baea: Resolve model parameter defaults consistently across configuration UIs and runtime model creation, and expose provider parameter rules through the plugin SDK.

## 3.17.0

### Minor Changes

- 747732e: v3.17

### Patch Changes

- e44e5bc: Add shared IMAGE and VIDEO model clients, Managed Queue checkpoints for asynchronous AIGC jobs, host-owned model provider resolution, authoritative model usage reporting, and versioned token/generation/second usage accounting for model plugins.

## 3.16.0

### Minor Changes

- b800da5: v3.16

## 3.15.18

### Patch Changes

- 2f6bf18: Support localized plugin display names and descriptions across plugin metadata, the platform registry, and marketplace dialogs.

## 3.15.17

### Patch Changes

- 0a90701: release 3.15.17

## 3.15.16

### Patch Changes

- 90a268b: Initialize assistant template prompt workflows as reusable workspace commands.

## 3.15.15

### Patch Changes

- 8a0eba3: Calculate membership points proportionally, constrain tokens-per-point settings to safe presets, expose non-duplicated point usage by runtime organization in Copilot usage summaries, and support tiered model pricing.
- 5d4a308: Support multiple provider help links in integration configuration while preserving the legacy single-link fallback.

## 3.15.14

### Patch Changes

- 8a46f00: Expose shared marketplace categories and recommended template metadata through the Xpert marketplace contracts.

## 3.15.13

### Patch Changes

- 25664c9: Persist and aggregate conversation task summaries and enable the responsive summary card with resource opening in ClawXpert.

## 3.15.12

### Patch Changes

- b8bac1f: Add system-plugin Sandbox Actions, the action-oriented Sandbox Jobs Core, provider-neutral Runtime Definitions, the minimal Runtime Provider/workspace mapper SPI, Worker heartbeat health, and Browser execution-pool capability discovery.
- b905a58: Publish the Workbench file-open command key, file payload, and evidence payload contracts for host and plugin reuse.

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

## 3.9.5

### Patch Changes

- 9e37ff9: updates

## 3.9.4

### Patch Changes

- 07057a6: pet of chatkit

## 3.9.3

### Patch Changes

- ea234e5: skills & middleware selection
- 4920c48: Add runtime-selectable sub-agent connection metadata.

## 3.9.2

### Patch Changes

- 8187f99: Update chatkit

## 3.9.1

### Patch Changes

- e040933: Tenant shared workspace to organization's users

## 3.9.0

### Patch Changes

- 4dcf5b5: add sso in plugin sdk
- 7fff870: beta 2
- c76facd: beta v
- 5b5c8ef: Updates

## 3.9.0-beta.2

### Patch Changes

- Updates

## 3.9.0-beta.1

### Patch Changes

- beta v
