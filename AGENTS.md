# AGENTS Guide for Xpert

This repo uses NestJS + TypeORM on the server and Angular 17 (standalone, signals, new control flow) on the client. Follow these rules when extending the codebase.

## General

- Prefer `rg` for search; keep edits ASCII; do not revert user changes.
- Golden rule: prefer writing Tailwind utility classes directly on HTML elements. Only extract component CSS when inline utilities are impractical, such as `:host`, pseudo-elements, or other selector-driven cases.
- Use Angular Aria + TailwindCSS v4 for UI components.
- Use standalone Angular components with signals, the new control flow like `@for/@if`, and reactive forms. Keep templates Tailwind-first.
- Keep comments succinct; add only when clarifying non-obvious logic.
- For high-risk infrastructure or orchestration files, add a short top-of-file comment only when the file carries non-obvious constraints, historical failure modes, or compatibility invariants. Prefer `Why this exists:` or `Invariants:` over generic responsibility summaries. Keep it to 3-6 high-signal lines and keep it aligned with the code and tests.
- Never use `as any`.
- Never cast `unknown` or broad values to `Record<string, unknown>`, and never introduce generic `asRecord()`-style helpers to bypass type checking.
- Narrow `unknown` values with explicit type guards and property-level structural checks; only cast to a specific interface after those checks.
- For branded ID types, keep only the shared primitives in `packages/contracts/src/types.ts`, such as `Brand`, `EntityId`, and base `ID`.
- Define concrete branded IDs inside their domain folders, such as `packages/contracts/src/project/project-id.type.ts`, `packages/contracts/src/team/team-id.type.ts`, and `packages/contracts/src/ai/xpert-id.type.ts`.
- At I/O boundaries, convert raw strings to branded IDs with domain factory helpers like `createProjectId()` or `createXpertId()`; do not scatter inline branded casts throughout feature code.
- Treat middleware tool schemas, controller params, DTOs, route params, form values, and other external inputs as raw `string` IDs. Convert them once at the adapter boundary before calling domain services.
- In NestJS services, do not hand-roll repeated helpers like `normalizeRequiredProjectId()` for each field. Prefer the shared branded-id normalizers in `packages/server-ai/src/shared/utils/branded-id.ts`, then pass branded values into TypeORM create/update/query calls.
- Be especially careful with `QueryDeepPartialEntity` and `FindOptionsWhere`: branded IDs should be normalized before building these objects, rather than trimmed or narrowed inline on the TypeORM generic payload.
- In TypeORM entities, any branded string ID field must declare an explicit column type like `@Column({ type: 'uuid' })`. Do not rely on reflected metadata for branded fields, because Nest/TypeORM will see them as `Object`.
- Never guess types, categories, or payload meaning from names, display text, localized copy, sample data, or incidental field combinations. Logic that depends on machine-readable distinctions must use explicit typed fields defined in shared contracts, such as discriminated unions or a stable `type`.
- If the required discriminator or type is missing, do not invent one locally and do not hard-code heuristic detection. Add the type to the shared contract first, or pause and confirm the new type before implementing downstream filtering, routing, rendering, or business logic.

## Boilerplate

- Minimize boilerplate aggressively, but do it by extracting repeated logic into the nearest shared layer, not by adding thin wrappers everywhere.
- Before adding a new helper, service method, or component abstraction, check whether an existing shared utility, base service, facade, or domain helper already solves at least 80 percent of the need.
- If the same normalization, validation, mapping, or query-building pattern appears in two or more places within the same subdomain, extract it in the same change instead of copying it again.
- Keep one-off code inline when it is truly local; do not introduce abstractions whose only job is renaming a single call or moving 2-3 obvious lines out of sight.
- Prefer explicit input-to-domain mappers at boundaries over repeating ad hoc `trim`, defaulting, and guard logic across create, update, and query paths.
- For branded IDs and similar boundary-heavy rules, centralize the conversion helpers once and reuse them; do not create per-service variants of the same normalizer.
- For middleware and controllers, prefer one domain-specific boundary resolver per adapter, such as `resolveProjectToolScope()`, instead of normalizing the same IDs separately inside each handler.
- When reducing boilerplate, prefer small, composable utilities with domain names over generic meta-helpers that hide types, validation rules, or ownership.

## Backend (NestJS)

- Patterns: entities in `packages/server-ai/src/**`, services extend `TenantOrganizationAwareCrudService` or base classes, controllers extend `CrudController` when possible.
- Register modules in `packages/server-ai/src/index.ts` and wire into `app.module.ts` as needed.
- Keep TypeORM entities aligned with contract interfaces in `packages/contracts`.
- Complex, independent logic can be implemented using CQRS.
- Ensure clearer boundaries of responsibilities.

## Frontend (Angular)

- Services live in `apps/cloud/src/app/@core/services`; export them via the barrel.
- New settings pages belong under `apps/cloud/src/app/features/setting/**`, use standalone components and lazy routing files exporting `routes`.
- RxJS: use `forkJoin` only with finite observables. Many repo services are wrapped by org/store streams (`selectOrganizationId`, `BehaviorSubject`, refresh streams) and may emit without completing; when combining them with `forkJoin`, always convert them to one-shot requests first with `take(1)`/`firstValueFrom`, otherwise loading states can hang forever. Use `combineLatest` instead when live updates are intended.
- Styling: prefer Tailwind utility classes directly in templates; only keep component CSS for cases that cannot be expressed cleanly inline. Do not add any new SCSS stylesheets.
- Use translate for text in html.
- Support light/dark modes via Tailwind CSS classes, No hard-coded color classes or color literals introduced.
- Prefer using JavaScript's async/await functionality over RxJS.
- Prefer using the inject() function over constructor parameter injection.

### Class Binding Rule

- For binary states (true/false), use inline `[class]` expressions to keep the template minimal.
- For multi-state conditions (more than two variants), use `[ngClass]` with a state-to-class mapping.
- Avoid stacking multiple `[class.xxx]` bindings for the same condition.

Rationale: keep simple cases concise, and complex cases structured and maintainable.

## API Endpoints

- Server skill repositories: `POST /skill-repository` to register, `GET /skill-repository` list, indexes at `/skill-repository/indexes` with `POST /sync/:repositoryId`.
- Match client services to these REST shapes; keep organization/tenant context via base services.

## Testing & Validation

- Run targeted tests when possible; otherwise state when not run.
- Validate forms with Angular `Validators`, show errors via Toastr and `getErrorMessage`.

## UX Notes

- Favor a modern enterprise aesthetic: structured layouts, restrained visual accents, clear information hierarchy, and confident CTAs.
- Provide loading/empty states; support search/filter/sort when dealing with lists.
