# @xpert-ai/plugin-sdk

## 3.20.0

### Minor Changes

- a01cd48: Add the realtime voice model capability, model protocol adapter contract, and Bosi voice sessions. Assistant creation and settings can select an independently authorized realtime model and voice. The host relays bounded PCM audio over an authenticated, single-use-ticket WebSocket and dispatches durable Assistant tasks independently of call lifetime. Create the voice tables and timing columns through the platform's existing TypeORM entity synchronization (the schema-sync job in externally managed deployments), and configure allowed renderer origins before enabling calls. No separate realtime voice SQL migration is required.

  Introduce host-owned message envelopes with explicit source, target, correlation, and presentation for voice and future Assistant/Agent messages. Persist them in a dedicated typed `ChatMessage.messageEnvelope` JSONB column. Retain runtime execution, retry and branch history while applying consistent public-history filtering and protecting provenance from client edits. Apply the message-envelope migration before deployment.

- bf33018: Expose optional version-pinned CLI background transports and V2 execution receipts that separate business cwd from managed execution records. Preserve V1 receipts and support bounded runtime reads.
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

- 00db21e: Add optional ResourceCardProvider registration and batched, read-only card resolution to the plugin SDK. Dispatch live conversation card updates through a single host handler with scoped provider lookup, resource identity validation and isolated deadlines. Migrate project task cards to this provider path while keeping unregistered types as saved snapshots. Keep initial project card construction and refreshed presentation together in ProjectTaskCardProvider.

### Patch Changes

- 1df94f0: Add version-qualified background CLI profiles for Claude Code 2.1.63, CodeBuddy
  2.161.1 and Kimi Code 2.1.1. Support an optional literal argv prompt argument in
  the SDK JSONL transport contract. Configure isolated settings and explicit
  permission modes; Kimi advertises only allow because its prompt mode forces
  automatic approval. Keep revisions unchanged for unrelated tools.

  Execution still requires a matching host transport and Agent Runtime adapter.

- bf33018: Make managed background Coding CLI permissions configurable through the existing
  tenant model execution policy, defaulting to allow with per-tool restricted
  overrides. Pin the selected mode in runner receipts and keep evidence-only review
  restrictions. Advertise supported modes in CLI profiles; leave interactive and
  managed shell sessions unchanged.
- d4dba33: Add the Conversation Map data and action services with authorized Assistant-family pagination, visible message search, branch-aware summaries, and typed branch titles. Reuse existing conversation creation, rename, branch, and navigation services, and return the existing side chat on request retries even after its source starts another run.
- 01fd502: Add the on-demand Conversation Map Workbench View with shared shadcn controls, React Flow layouts, searchable conversation and branch navigation, and host-backed display preferences. Include compact directory rows, content-sized cards, accessible action tooltips, and reproducible source builds.

  Use `agent.workbench` as the canonical Assistant Workbench slot. Normalize legacy `agent.workbench.fixed` and `agent.workbench.main` requests and plugin declarations at the host boundary, preserving authorization and opening preferences without duplicate views.

- deff039: Add persisted conversation Resource Cards, the public emitResourceCard helper and optional transactional Project creation receipts. Cards use typed Workbench navigation without changing file Artifacts. Scheduler creation now emits a receipt and offers an on-demand, authorized detail/edit/history View. ChatKit and Xpert SDK companion releases are required for the UI; publish public contracts/SDK before consuming plugins.

  Opening an Assistant Project target with a View now opens a separately scoped host tab, retaining the current conversation, composer and ChatKit mount. The target Project is authorized independently, and its View scope survives refresh and browser history. Explicit Project selection without a View retains its existing workspace-switch behavior.

- b66bdcc: Add optional invocation activity capture and an independent Coding Execution View. Persist scoped, resumable public CLI activity and private bounded output archives; unify direct runtime cards and project execution navigation without coupling collection to task acceptance.
- b86bba1: Add execution-scoped model grants, protocol bridges, CLI launchers, budget enforcement, attributed usage settlement and audited reconciliation. Expose the native model SDK and scoped host runner capability, and accept CLI prompt-cache hints without forwarding provider credentials to execution environments.

  Add typed Agent execution results, authorized file delivery and bounded task observation. Preserve background execution during logout, centralize conversation file access, retain explicit Assistant middleware configuration, and allow validated text-only receipts from image-capable tools. Include the API and Web releases required by these shared contracts and runtime changes.

- c0dd14c: Add provider-registered business task types with localized labels and controlled Lucide icon tokens. Persist taskType in the existing type column, preserve legacy values, and resolve presentation independently of hierarchy, status and assignee. Project Tasks list, tree, Gantt, board and detail views share one icon renderer. No database migration is required.
- 3142346: Support explicit file/archive delivery in project task delegation, pin selections in durable dispatch intents and reject changed selections on replay. Share the delivery schema through contracts while preserving SDK exports. Reject wildcard paths before delegation and retain evidence-only review confinement.
- 3185f56: Add explicit, revision-bound Project Task acceptance and rework decisions. Bind decisions to the current implementation, specification, and result or Artifact versions; keep retries idempotent and reject completion through generic task updates. Once independent review is requested, acceptance requires the latest valid passing review for that implementation.

  Expose runtime progress, delivery and consumption, review reports, decision history, and authorized human controls in Tasks & Timeline. OS provides the shared review protocol and validation; the current review dispatch gate requires the Computer OpenCode executor supplied by Pro. This batch does not include Computer execution, live conversation streams, or message cards.

  Apply `20261006-project-task-decisions.sql` after the task association and reliable reply migrations. Validation covers local tests and isolated PostgreSQL; it does not represent live model or CLI acceptance.

- 55ec356: Add typed ModelRequest.requirements and mergeModelRequirements for per-call capability requirements, initially supporting ModelFeature.VISION. The host validates and snapshots middleware contributions, unions requirements across the call chain, and checks each invoked model including fallbacks. Required capabilities cannot silently degrade or substitute a static response. Calls without requirements retain existing behavior. Generic multimodal ToolNode support remains deferred.
- fffb0f4: Add the scoped `ToolImagesRuntimeCapability` for immutable tool image references and temporary verified model input. Bind storage and Artifact access to the current host conversation, enforce complete tool rounds and checksum validation, and keep image bytes out of tool messages and checkpoints. Legacy image-tool history is sanitized only in outbound request copies.
- d81dbe2: Allow Workbench Views to opt into conversation context updates while staying mounted, and connect exact branch and message navigation to ChatKit.
- a131790: Add optional message anchors and originating-view preservation to Workbench conversation navigation contracts. The navigation resolver accepts an exact thread and message, validates thread ownership and visible user/assistant message membership, and retains the default thread behavior for older requests. Validate optional anchors at the HTTP boundary before resolving access.
- Updated dependencies [d18aa7f]
- Updated dependencies [b86bba1]
- Updated dependencies [a01cd48]
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
- Updated dependencies [d81dbe2]
- Updated dependencies [a131790]
  - @xpert-ai/contracts@3.20.0

## 3.19.0

### Minor Changes

- 99d09ec: Release a coordinated minor update across all Xpert workspace packages, including the API, Web and Bosi applications, shared SDK and contracts, backend and UI libraries, bundled plugins, sandbox runtimes and documentation.

### Patch Changes

- 8a78318: Add explicit application Project types, provider-backed domain bindings, and typed Project provisioning/access contracts. App plugins using ProjectTypeProvider require these releases (3.19.0 or newer) and the matching host Project type endpoints/schema migration.
- Updated dependencies [8a78318]
- Updated dependencies [1e44173]
- Updated dependencies [c953822]
- Updated dependencies [b7983c8]
- Updated dependencies [08f66e7]
- Updated dependencies [b62543f]
- Updated dependencies [5f26e05]
- Updated dependencies [99d09ec]
  - @xpert-ai/contracts@3.19.0

## 3.18.7

### Patch Changes

- 5213185: Expose keyword analyzer strategy interfaces, discovery metadata, and a scoped registry with exact source lookup. Add optional plugin removal preflight guards so hosts can protect active analyzer dependencies.

  Correct read-only SQL classification for derived tables, CTE column declarations and type modifiers, and preserve duplicate MySQL output names with direct bounded pagination.

## 3.18.6

### Patch Changes

- a8a251d: Support non-tool MCP capabilities, task policies and transport-specific input validation on decorated tool providers. Pass execution-scoped workspace files and Agent feature configuration to middleware business methods and allow existing MCP result envelopes without requiring a new structured output schema.

  Share runtime component fingerprinting across host entry points and include transport input schemas, task policies, resources, resource templates and prompts in update detection.

  Add resource, resource-template and prompt method decorators with inherited method discovery, shared runtime/fingerprint definitions and legacy extension compatibility.

- 983b730: Prepare the Xpert 3.18.6 patch release, including plugin-sdk.

  Extend decorated MCP capabilities and structured knowledge graph runtime contracts.
  Improve document parsing and scanned-page understanding, semantic FAQ exclusion,
  manual tags during document import, and per-knowledgebase vector storage selection.
  Include schema-driven sliders and the scoped database workbench adapter.

  The target platform version is 3.18.6. Verify contracts, plugin-sdk, and xpert-ui
  all resolve to this version in the release version PR, including changelogs,
  internal dependency references, and lockfile entries. Publish the separately
  versioned Runtime Suite source images before creating platform-version aliases.

- Updated dependencies [9a2a2a0]
- Updated dependencies [089e3ff]
- Updated dependencies [983b730]
  - @xpert-ai/contracts@3.18.6

## 3.18.5

### Patch Changes

- 6a51c17: Add a shared knowledge document language hint and bounded, model-free language detection for natural text chunk boundaries. Preserve Auto strategy routing, explicit separators, token limits, and parent-child behavior, and expose the requested and detected languages in chunk previews.
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

- Updated dependencies [6a51c17]
- Updated dependencies [95ec638]
- Updated dependencies [8402f72]
  - @xpert-ai/contracts@3.18.5

## 3.18.4

### Patch Changes

- 3f72082: Add opt-in lazy template catalogs, summary pagination, explicit prompt locales and source revision tracking. Existing eager template providers remain compatible.

  Restore role skill bindings when switching templates and preserve localized skill names during installation and selection.

- 4be390b: Release Xpert 3.18.4 with aligned contracts, plugin-sdk, and Web application versions.

- 63cd444: Allow host-enabled graph Connector providers in scoped runtime credentials while preserving explicit binding checks. Existing Connector APIs remain compatible.
- Updated dependencies [3f72082]
- Updated dependencies [7b97fee]
- Updated dependencies [4be390b]
- Updated dependencies [4e8c7ed]
  - @xpert-ai/contracts@3.18.4

## 3.18.3

### Patch Changes

- d107704: Add Assistant Profile display contracts and capability/activity indicators, trusted Assistant version identities, and the feature-gated Profile tab slot. Expose static Middleware Tool names and human Project access to plugin server services, and provide the shared Zard Hover Card interaction primitive.
- Updated dependencies [d107704]
  - @xpert-ai/contracts@3.18.2

## 3.18.2

### Patch Changes

- e260743: plugin mcp
- Updated dependencies [e260743]
  - @xpert-ai/contracts@3.18.1

## 3.18.1

### Patch Changes

- a86016e: Increase the default maximum output token limit to 2048.

## 3.18.0

### Minor Changes

- 8e63a8b: Release Xpert 3.18.0.

### Patch Changes

- 477b711: Allow connector plugins to declare an embedded QR authorization presentation while the host manages polling and cancellation.
- dad112d: Add authoritative Project View runtime scopes, membership and scheduling contracts, read/edit/manage action access, immutable Xpert workspace data scopes, scoped Connector bindings with personal or shared authorization, eligible expert providers, Project-scoped workspace files, and collaboration support.
- 1c71b75: Add Project-scoped Connector authorization and scheduled tasks that run as a confirmed Project member.
- d45a0c8: Add governed Project instructions and skills with sandbox read-only enforcement.
- Updated dependencies [dad112d]
- Updated dependencies [8e63a8b]
- Updated dependencies [1c71b75]
- Updated dependencies [d45a0c8]
  - @xpert-ai/contracts@3.18.0

## 3.17.6

### Patch Changes

- afb69b7: Release Xpert 3.17.6 after publishing the complete Sandbox Runtime image suite.
- Updated dependencies [afb69b7]
  - @xpert-ai/contracts@3.17.6

## 3.17.5

### Patch Changes

- 9e59e41: Add stable tenant- and organization-scoped MCP publication, capability, authentication, execution context, tool result, resource, prompt, app, task, and change-event contracts for the Xpert MCP publishing platform.

  Keep plugin schema contracts on the Zod v3 compatibility API while allowing consumers to install Zod 3.25 or Zod 4.

- Updated dependencies [9e59e41]
  - @xpert-ai/contracts@3.17.5

## 3.17.4

### Patch Changes

- 7b6954a: project
- Updated dependencies [7b6954a]
  - @xpert-ai/contracts@3.17.4

## 3.17.3

### Patch Changes

- 754866e: Add reusable enterprise H5 identity and single-assistant session contracts.
- Updated dependencies [754866e]
  - @xpert-ai/contracts@3.17.3

## 3.17.2

### Patch Changes

- fa1306a: Add conditional LLM pricing rules, provider-reported price authority, cache and add-on components, mixed cache-write TTL pricing, recurring daily price windows frozen at invocation start, and component-aware multi-unit usage reporting for specialized models.
- Updated dependencies [fa1306a]
  - @xpert-ai/contracts@3.17.2

## 3.17.1

### Patch Changes

- 612baea: Resolve model parameter defaults consistently across configuration UIs and runtime model creation, and expose provider parameter rules through the plugin SDK.
- Updated dependencies [612baea]
  - @xpert-ai/contracts@3.17.1

## 3.17.0

### Minor Changes

- 747732e: v3.17

### Patch Changes

- e44e5bc: Add shared IMAGE and VIDEO model clients, Managed Queue checkpoints for asynchronous AIGC jobs, host-owned model provider resolution, authoritative model usage reporting, and versioned token/generation/second usage accounting for model plugins.
- Updated dependencies [747732e]
- Updated dependencies [e44e5bc]
  - @xpert-ai/contracts@3.17.0

## 3.16.1

### Patch Changes

- 57721a6: Normalize missing assistant roles in OpenAI-compatible completion responses.

## 3.16.0

### Minor Changes

- b800da5: v3.16

### Patch Changes

- Updated dependencies [b800da5]
  - @xpert-ai/contracts@3.16.0

## 3.15.18

### Patch Changes

- 2f6bf18: Support localized plugin display names and descriptions across plugin metadata, the platform registry, and marketplace dialogs.
- Updated dependencies [2f6bf18]
  - @xpert-ai/contracts@3.15.18

## 3.15.17

### Patch Changes

- 0a90701: release 3.15.17
- Updated dependencies [0a90701]
  - @xpert-ai/contracts@3.15.17

## 3.15.16

### Patch Changes

- 90a268b: Initialize assistant template prompt workflows as reusable workspace commands.
- Updated dependencies [90a268b]
  - @xpert-ai/contracts@3.15.16

## 3.15.15

### Patch Changes

- a26a776: Add opt-in multi-auth connector strategies, provider-neutral runtime credentials, and legacy credential mapping.

  Integration-enabled plugins can also opt into inherited tenant and organization configuration reads for connector-owned OAuth apps.

  Existing `ConnectorDefinition`, `ConnectorStrategy`, `ConnectorRuntimeCredential`, `ConnectorRuntimeApi.getConnector()`, and legacy registry accessors remain available unchanged. New providers can implement `ConnectorMultiAuthStrategy`, while runtime consumers can adopt `getConnectorCredential()` when the host exposes it.

- 8a0eba3: Calculate membership points proportionally, constrain tokens-per-point settings to safe presets, expose non-duplicated point usage by runtime organization in Copilot usage summaries, and support tiered model pricing.
- e3d3c26: Add a machine-readable stale steer callback error and close the execution-completion race before channel follow-ups are persisted.
- Updated dependencies [8a0eba3]
- Updated dependencies [5d4a308]
  - @xpert-ai/contracts@3.15.15

## 3.15.14

### Patch Changes

- Updated dependencies [8a46f00]
  - @xpert-ai/contracts@3.15.14

## 3.15.13

### Patch Changes

- b269a84: Add development-only Runtime Bindings and the OSS Local Browser Runtime used for source-checkout PDF/PPTX export tests, while keeping production execution fail-closed.
- Updated dependencies [25664c9]
  - @xpert-ai/contracts@3.15.13

## 3.15.12

### Patch Changes

- b8bac1f: Add system-plugin Sandbox Actions, the action-oriented Sandbox Jobs Core, provider-neutral Runtime Definitions, the minimal Runtime Provider/workspace mapper SPI, Worker heartbeat health, and Browser execution-pool capability discovery.
- Updated dependencies [b8bac1f]
- Updated dependencies [b905a58]
  - @xpert-ai/contracts@3.15.12

## 3.15.11

### Patch Changes

- aa16ee9: Publish a browser-safe collaboration client entry at `@xpert-ai/plugin-sdk/collaboration-client`.
- Updated dependencies [aa16ee9]
  - @xpert-ai/contracts@3.15.11

## 3.15.10

### Patch Changes

- c9d8401: collaboration & artifacts
- Updated dependencies [c9d8401]
  - @xpert-ai/contracts@3.15.10

## 3.15.9

### Patch Changes

- 601438f: fix org membership plan
- Updated dependencies [601438f]
  - @xpert-ai/contracts@3.15.9

## 3.15.8

### Patch Changes

- 121ced0: Final stable version
- Updated dependencies [7ab7aa1]
- Updated dependencies [121ced0]
  - @xpert-ai/contracts@3.15.8

## 3.15.7

### Patch Changes

- 5e553ae: Add connector strategy contracts and runtime capability helpers for workspace connector plugins.

## 3.15.6

### Patch Changes

- 3249145: plugin artifact namespace
- Updated dependencies [3249145]
  - @xpert-ai/contracts@3.15.7

## 3.15.5

### Patch Changes

- 0473ce2: upgrade kb
- Updated dependencies [0473ce2]
  - @xpert-ai/contracts@3.15.6

## 3.15.4

### Patch Changes

- 693806f: workspace files
- Updated dependencies [693806f]
  - @xpert-ai/contracts@3.15.5

## 3.15.3

### Patch Changes

- bdcb73b: handoff messages
- Updated dependencies [bdcb73b]
  - @xpert-ai/contracts@3.15.4

## 3.15.2

### Patch Changes

- 481ffba: file understanding & vector store
- Updated dependencies [481ffba]
  - @xpert-ai/contracts@3.15.3

## 3.15.1

### Patch Changes

- 8fded17: plugin scope for tenant
- Updated dependencies [8fded17]
  - @xpert-ai/contracts@3.15.2

## 3.15.0

### Minor Changes

- c1e4da2: managed queue

### Patch Changes

- Updated dependencies [c1e4da2]
  - @xpert-ai/contracts@3.15.1

## 3.14.0

### Minor Changes

- 6f679b8: fix plugin tenant scope & human chat files types

### Patch Changes

- Updated dependencies [6f679b8]
  - @xpert-ai/contracts@3.15.0

## 3.13.0

### Minor Changes

- 54cff15: tenants and managed connections
- 6978bfd: release plugin tenant scope

### Patch Changes

- Updated dependencies [54cff15]
- Updated dependencies [6978bfd]
  - @xpert-ai/contracts@3.14.0

## 3.12.2

### Patch Changes

- f23228b: client commands for extension view
- Updated dependencies [e6528c8]
- Updated dependencies [f23228b]
  - @xpert-ai/contracts@3.13.0

## 3.12.1

### Patch Changes

- 6a17eca: plugin sdk and mcp toolset close
- Updated dependencies [6a17eca]
  - @xpert-ai/contracts@3.12.1

## 3.12.0

### Minor Changes

- d017897: plugin integration guard

### Patch Changes

- Updated dependencies [d017897]
  - @xpert-ai/contracts@3.12.0

## 3.11.2

### Patch Changes

- 7418eef: version

## 4.0.0

### Minor Changes

- d92d0f2: upgrade zard ui

### Patch Changes

- Updated dependencies [d92d0f2]
  - @xpert-ai/contracts@3.11.0

## 3.11.0

### Minor Changes

- 49101da: release

### Patch Changes

- Updated dependencies [49101da]
  - @xpert-ai/contracts@3.10.1

## 3.10.0

### Minor Changes

- a83c9ea: fix

## 4.0.0

### Minor Changes

- df9d7e2: agentic app

### Patch Changes

- Updated dependencies [df9d7e2]
  - @xpert-ai/contracts@3.10.0

## 3.9.9

### Patch Changes

- Updated dependencies [2acc11a]
  - @xpert-ai/contracts@3.9.9

## 3.9.8

### Patch Changes

- 2558760: updates
- Updated dependencies [2558760]
  - @xpert-ai/contracts@3.9.8

## 3.9.5

### Patch Changes

- 9e37ff9: updates
- Updated dependencies [9e37ff9]
  - @xpert-ai/contracts@3.9.5

## 3.9.4

### Patch Changes

- Updated dependencies [07057a6]
  - @xpert-ai/contracts@3.9.4

## 3.9.3

### Patch Changes

- ea234e5: skills & middleware selection
- Updated dependencies [ea234e5]
- Updated dependencies [4920c48]
  - @xpert-ai/contracts@3.9.3

## 3.9.2

### Patch Changes

- 8187f99: Update chatkit
- Updated dependencies [8187f99]
  - @xpert-ai/contracts@3.9.2

## 3.9.1

### Patch Changes

- e040933: Tenant shared workspace to organization's users
- Updated dependencies [e040933]
  - @xpert-ai/contracts@3.9.1
  - @xpert-ai/ocap-core@3.9.1

## 3.9.0

### Patch Changes

- 4dcf5b5: add sso in plugin sdk
- 7fff870: beta 2
- c76facd: beta v
- 5b5c8ef: Updates
- Updated dependencies [4dcf5b5]
- Updated dependencies [7fff870]
- Updated dependencies [c76facd]
- Updated dependencies [5b5c8ef]
  - @xpert-ai/contracts@3.9.0
  - @xpert-ai/ocap-core@3.9.0

## 3.9.0-beta.2

### Patch Changes

- Updates
- Updated dependencies
  - @xpert-ai/contracts@3.9.0-beta.2
  - @xpert-ai/ocap-core@3.9.0-beta.2

## 3.9.0-beta.1

### Patch Changes

- beta v
- Updated dependencies
  - @xpert-ai/contracts@3.9.0-beta.1
  - @xpert-ai/ocap-core@3.9.0-beta.1
