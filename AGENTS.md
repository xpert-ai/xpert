# AGENTS Guide for Xpert

This repo uses NestJS + TypeORM on the server and Angular 17 (standalone, signals, new control flow) on the client. Follow these rules when extending the codebase.

## General

- Run pnpm commands through Corepack so the repo's `packageManager` is honored. Use `corepack pnpm ...` instead of bare `pnpm ...`; this repo currently expects `pnpm@10.24.0`, and using another pnpm version can rebuild an incompatible `node_modules` layout.
- Golden rule: code files must not exceed 1,000 lines; when a file reaches that threshold, review its responsibilities and refactor coherent functionality into focused modules.
- Golden rule: prefer writing Tailwind utility classes directly on HTML elements. Only extract component CSS when inline utilities are impractical, such as `:host`, pseudo-elements, or other selector-driven cases.
- Use Angular Aria + TailwindCSS v4 for UI components.
- Use standalone Angular components with signals, the new control flow like `@for/@if`, and reactive forms. Keep templates Tailwind-first.
- Keep comments succinct; add only when clarifying non-obvious logic.
- For high-risk infrastructure or orchestration files, add a short top-of-file comment only when the file carries non-obvious constraints, historical failure modes, or compatibility invariants. Prefer `Why this exists:` or `Invariants:` over generic responsibility summaries. Keep it to 3-6 high-signal lines and keep it aligned with the code and tests.
- Never use `as any`.
- Never cast `unknown` or broad values to `Record<string, unknown>`, and never introduce generic `asRecord()`-style helpers to bypass type checking.
- Narrow `unknown` values with explicit type guards and property-level structural checks; only cast to a specific interface after those checks.
- Keep property-level readers and structural checks at trust boundaries only, such as API bodies, external package metadata, and JSON columns read from persistence. After a boundary parser/type guard returns a concrete shared-contract type, downstream services should use typed fields directly instead of continuing to call `read*()` helpers. If a service still needs property-level readers, move that parsing earlier or introduce a typed boundary parser first.
- Never guess types, categories, or payload meaning from names, display text, localized copy, sample data, or incidental field combinations. Logic that depends on machine-readable distinctions must use explicit typed fields defined in shared contracts, such as discriminated unions or a stable `type`.
- If the required discriminator or type is missing, do not invent one locally and do not hard-code heuristic detection. Add the type to the shared contract first, or pause and confirm the new type before implementing downstream filtering, routing, rendering, or business logic.

## Backend (NestJS)

- New code must import `RequestContext` from `@xpert-ai/plugin-sdk`, never `@xpert-ai/server-core`. The pre-commit check reads staged changes and rejects new legacy imports without requiring an unrelated migration of existing code.
- Patterns: entities in `packages/server-ai/src/**`, services extend `TenantOrganizationAwareCrudService` or base classes, controllers extend `CrudController` when possible.
- Register modules in `packages/server-ai/src/index.ts` and wire into `app.module.ts` as needed.
- Keep TypeORM entities aligned with contract interfaces in `packages/contracts`.
- TypeORM entity columns must not rely on decorator metadata for unsafe property types. If an `@Column` property uses a union, literal union, imported type alias, enum-like type reference, object/interface shape, array, `Record`, `unknown`, or `any`, the decorator must explicitly declare `type`. Use `type: 'varchar'` for string unions, `type: 'int'` for numeric unions, and `type: 'json'` or `type: 'jsonb'` for structured data.
- Ensure clearer boundaries of responsibilities.

### Subfeature organization

- A cohesive subfeature with its own Controller and Service belongs in a dedicated subdirectory under its owning feature, such as `xpert/assistant-appearance/`. Keep its schemas, DTOs, helpers and tests together instead of adding them to the parent directory.
- Directory boundaries do not require a NestJS Module. Register small subfeatures in the owning Module; introduce a submodule when it provides a meaningful dependency, provider or export boundary.

### Dependency injection and service boundaries

- Declare ordinary service dependencies through constructor injection and explicit module `imports`/`exports`. Do not use generic `ModuleRef.get(..., { strict: false })` helpers or string-based service lookup to hide static dependencies; missing providers should fail during module initialization.
- For shared operations across domains, prefer an existing typed CQRS entry point or define a focused Command/Query and Handler in the owning domain. Follow the Shared CQRS operations guidance below; keep authorization policy with the capability that owns it.
- Controllers and business callers must invoke concrete business methods. Do not expose public `service<T>()`, `resources()` or similar getters that return underlying service instances and turn a business service into a general-purpose service locator.
- Resolve circular dependencies by reviewing module boundaries, extracting cohesive shared capabilities, or moving operations to their owning domain. Do not use `strict: false` to conceal a dependency cycle. Verify module wiring with dependency-injection tests when changing these boundaries.

### Shared CQRS operations

- When a reusable capability has one cohesive entry point, prefer a typed CQRS Command and Handler over requiring consumers to inject its Service and import its owning Module. Register the Handler once in the owning platform module; consumers use the shared `CommandBus` and public Command contract.
- Keep reusable policy decisions, including role-specific exceptions, inside the owning capability. Business callers supply trusted scope, handle the result using their domain errors, and retain their action and resource authorization checks.
- Keep Command JSDoc brief: describe purpose, when to use the command, and essential responsibility boundaries. Let types express inputs and results; avoid detailed Returns sections, error inventories, and Handler implementation details such as database queries or branching rules. Document non-obvious implementation constraints in the Handler when needed.
- Keep small, single-entry API usage guidance in the Command comments and general design principles in this guide. Add a separate feature document only when it provides material beyond those two sources.

### ChatKit API boundary

- Put ChatKit business endpoints in `AIModule` under `/api/ai`, with shared authentication and explicit Assistant/conversation scope guards. Keep controllers thin and resource authorization in reusable business services; do not open management controllers to client secrets for ChatKit. Cookie-bound or short-lived authorized content URLs may remain separate.

### Authoring workspace versus Assistant file workspace

- `XpertWorkspace` (`xpert_workspace`, `xpert.workspaceId`) is the authoring resource container for Assistants, skills and connectors. Its `canRead/canRun/canWrite/canManage` capabilities are not Assistant file permissions.
- An Assistant file workspace is runtime data in a Volume, mapped into a sandbox filesystem. For non-Project files, resolve it using `resolveXpertDataVolumeScope`: `shared` uses tenant + Assistant identity; `user` additionally binds the authenticated user. Never substitute the Assistant creator or accept file ownership/catalog/root overrides from a client.
- Runtime file entry points must authorize the exact published Assistant through `ResolveAssistantFileAccessCommand` / `AssistantFilesService.forRuntime()`. Do not use `XpertService.findOne()`, `XpertWorkspaceService.canAccess()`, or workspace-level `canRun` as the file ACL. UserGroup access must work without authoring workspace membership.
- Shared Assistant files are explicitly collaborative: authorized users may read, upload, modify and delete. User-isolated files permit the same operations only in the current user's volume. File access never grants authoring workspace membership or editing rights.
- Studio uses `AssistantFilesService.forAuthoring()` and retains explicit authoring checks, including drafts. Choose the entry in trusted server code; never accept an authoring mode from HTTP data or fall back to authoring after runtime denial.
- Preserve credential audiences and revalidate current user access for standalone file browsing, including delegated USER_XPERT sessions. Project file access retains Project membership and Assistant binding; a Project-delegated session alone must not unlock the Assistant's non-Project volume.
- Keep filesystem containment and symlink protection in Volume APIs. Test real authorization services together with file operations for group-only access, revocation, cross-Assistant denial, user isolation and Studio draft access; mocks that always allow `findOne()` or `canAccess()` cannot cover this boundary.
- Conversation file APIs must distinguish parsed attachments (`/ai/conversations/:id/files`, FileAssets) from runtime directories (`/ai/conversations/:id/workspace/*`, Volumes). Never register both controllers for the same method and URL; keep SDK Workbench routes aligned and test both controllers together.

### Request validation

- For new schema-driven APIs, especially ModelExecution and inputs reused by HTTP, jobs or persistence, prefer Zod schemas with the shared `ZodValidationPipe` from `@xpert-ai/server-core`. Keep established DTO class + `ValidationPipe` modules consistent; do not migrate unrelated endpoints only for style.
- Put schemas in focused `*.schema.ts` modules and derive parsed parameter types with `z.output<typeof schema>`. Define coercion, defaults, unknown-key handling and cross-field constraints in that schema. Do not maintain a second decorated DTO validation rule set for the same input.
- Bind the pipe at the parameter boundary (`@Query(...)`, `@Body(...)`) so controllers receive validated, transformed values. A TypeScript interface or type annotation alone does not validate HTTP data.
- Keep the shared pipe independent of business modules and providers. Supply an exception factory to preserve domain error codes, i18next messages and metrics; do not return or log raw request values in validation errors.
- Validate once per trust boundary. Internal business methods accept concrete parsed types; validate external job payloads and persisted JSON when they enter the process, reusing the same schema. Avoid reparsing already validated parameters at every layer.
- Schemas validate payload shape, not authorization. Resolve tenant, organization, actor and billing scope from trusted context, and keep access checks in the authorization/business layer.
- Add HTTP route tests for pipe wiring, conversion/defaults, invalid and extra fields, and unchanged error responses. Direct calls to controller methods bypass NestJS pipes and cannot prove request validation works.

### Backend I18n

- New server-side runtime messages and errors must use `i18next`, not `nestjs-i18n` service injection.
- Import `t` from `i18next` and call namespace-qualified keys such as `t('server-ai:Error.SomeKey', { defaultValue })`; request language is supplied by the existing i18next bootstrap through `RequestContext`.
- Add `server-ai` namespace resources to `packages/server-ai/src/i18n/en.json`, `packages/server-ai/src/i18n/en-US.json`, and `packages/server-ai/src/i18n/zh-Hans.json`. Do not add new business error keys only to the nested `en/**` or `zh/**` `nestjs-i18n` resource files.

## Frontend (Angular)

- Services live in `apps/cloud/src/app/@core/services`; export them via the barrel.
- New settings pages belong under `apps/cloud/src/app/features/setting/**`, use standalone components and lazy routing files exporting `routes`.
- RxJS: use `forkJoin` only with finite observables. Many repo services are wrapped by org/store streams (`selectOrganizationId`, `BehaviorSubject`, refresh streams) and may emit without completing; when combining them with `forkJoin`, always convert them to one-shot requests first with `take(1)`/`firstValueFrom`, otherwise loading states can hang forever. Use `combineLatest` instead when live updates are intended.
- Styling: prefer Tailwind utility classes directly in templates; only keep component CSS for cases that cannot be expressed cleanly inline. Do not add any new SCSS stylesheets.
- Use translate for text in html.
- Support light/dark modes via Tailwind CSS classes, No hard-coded color classes or color literals introduced.
- Prefer using JavaScript's async/await functionality over RxJS.
- Prefer using the inject() function over constructor parameter injection.
- Golden rule: use Angular CDK `Clipboard` for copy actions, especially after asynchronous work; do not rely on `navigator.clipboard` retaining user activation, and verify that the first click copies successfully.

### Class Binding Rule

- For binary states (true/false), use inline `[class]` expressions to keep the template minimal.
- For multi-state conditions (more than two variants), use `[ngClass]` with a state-to-class mapping.
- Avoid stacking multiple `[class.xxx]` bindings for the same condition.

Rationale: keep simple cases concise, and complex cases structured and maintainable.

### Dialog Styling

- Golden rule: Angular CDK Dialogs use `backdropClass: 'backdrop-blur-xs-black'` and `panelClass: 'xp-overlay-pane-dialog'`; introduce another semantic panel class only for a genuinely different treatment.
- Dialog component roots own content sizing and layout only. Do not repeat the panel's clipping, radius, background, foreground, border/ring, outline, or shadow utilities at call sites or on the component root.
- New and migrated Dialogs opt into `xpDialogLayout="standard|wide"` and compose `xpDialogHeader`, `xpDialogHeading`, `xpDialogDescription`, `xpDialogBody` and `xpDialogFooter`. These shared regions own typography, spacing, scrolling and the muted footer surface; business templates own content and layout only. Use `xpDialogCloseButton` for the corner button's placement; retain its explicit close behavior. Do not confuse it with the existing `xpDialogClose` result/close directive.
- Dialog actions inherit geometry from the nearest Header / Footer or explicit `xpDialogActionGroup="header|inline|footer"`. Normal groups are 36px; `xpDialogPurpose="workflow"` makes the whole footer group 40px. A footer alone does not imply larger buttons. Coarse-pointer actions and single-line fields are at least 44px. Keep geometry in `dialog-action.variants.ts` and `dialog-frame.variants.ts`; do not set action size variants, height/min-height, padding or minimum widths in business templates. Buttons declare visual intent (`zType`), behavior/state and icon shape (`zSize="icon"`). Use natural text width and equal heights within each group; distinguish priority through color. Keep loading labels/icons mounted so the shared loading indicator does not change width.
- Within an opted-in Dialog, single-line `z-input`, select triggers and normal actions share 36px / 14px sizing. Textareas and multi-selects retain content-driven height; dropdown options and body tools are not action groups. Do not mark the entire Dialog as an action group. Verify computed dimensions of adjacent fields and buttons, loading states, long translations and narrow screens together. The 14px Cloud root must not silently shrink Dialog typography or targets; preserve scoped tokens instead of changing the global root.
- Dialog actions use an 8px radius, 10px horizontal padding for text buttons and a 6px icon/text gap, defined once in the shared action variants. Projected content inherits the gap; icon-only actions keep their square target. Keep the application font stack and 14px / 500 action typography.

## Desktop (Electron + React) Dialog Rendering

- Golden rule: Desktop fullscreen Dialogs blur background content with `filter`, not overlay `backdrop-filter`, which caused flicker during foreground animation in native macOS Electron tests. Preserve live blur and card glass; centralize the policy in `apps/desktop/src/styles.css`.
- Keep Dialog portals outside the filtered root, blur lower dialogs when nested, and restore the background on close. Keep animated glass panels a stable size and prefer `transform`/`opacity`.
- Desktop marketplace cards use `filter` on a copy of their own cover for glass blur. Keep that image aligned with the full card throughout expansion; avoid `backdrop-filter` on the translated information panel so its glass effect stays independent of the fullscreen background blur. Preserve the theme-derived translucent gray gradient and rounded clipping.
- Verify hover, nesting, cleanup and focus in native Electron using one-variable comparisons. Browser previews alone cannot prove the fix; do not claim a specific GPU/Chromium defect without evidence.

## API Endpoints

- Server skill repositories: `POST /skill-repository` to register, `GET /skill-repository` list, indexes at `/skill-repository/indexes` with `POST /sync/:repositoryId`.
- Match client services to these REST shapes; keep organization/tenant context via base services.

## Testing & Validation

- Run targeted tests when possible; otherwise state when not run.
- Validate forms with Angular `Validators`, show errors via Toastr and `getErrorMessage`.

### Assistant dependency compatibility

- Installation and publication preparation use exact dependency snapshots to detect concurrent source changes. Keep this check separate from the published Assistant's runtime availability check.
- Automatically recorded plugin versions and resource hashes are provenance, not compatibility requirements. Ordinary drift should recommend an update without stopping a run or rewriting the Assistant's graph, models, tools or resources. Do not infer breaking changes from version segments alone.
- Preserve explicit template version requirements, actual resource/provider availability and ownership, scoped authorization, and verification of immutable agent-plugin artifacts. Report the specific dependency and reason when execution must stop; do not describe every failure as a version mismatch.
- Plugin deployment, optional Assistant upgrades and fresh business acceptance are separate release facts. A compatible plugin update does not require republishing every Assistant, and API health alone does not establish business acceptance.

## UX Notes

- Golden rule: do not nest Cards to structure a section. Use a Title/divider plus Accordion, Tabs, or Carousel for grouping, and reserve Cards for leaf content.
- Favor a modern enterprise aesthetic: structured layouts, restrained visual accents, clear information hierarchy, and confident CTAs.
- Provide loading/empty states; support search/filter/sort when dealing with lists.
