# @xpert-ai/server-ai

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
