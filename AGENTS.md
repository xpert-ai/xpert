# AGENTS Guide for Xpert

This repo uses NestJS + TypeORM on the server and Angular 17 (standalone, signals, new control flow) on the client. Follow these rules when extending the codebase.

## General

- Prefer `rg` for search; keep edits ASCII; do not revert user changes.
- Golden rule: prefer writing Tailwind utility classes directly on HTML elements. Only extract component CSS when inline utilities are impractical, such as `:host`, pseudo-elements, or other selector-driven cases.
- Use Angular Aria + TailwindCSS v4 for UI components.
- Use standalone Angular components with signals, the new control flow like `@for/@if`, and reactive forms. Keep templates Tailwind-first.
- Keep comments succinct; add only when clarifying non-obvious logic.
- Never use `as any`.
- Never cast `unknown` or broad values to `Record<string, unknown>`, and never introduce generic `asRecord()`-style helpers to bypass type checking.
- Narrow `unknown` values with explicit type guards and property-level structural checks; only cast to a specific interface after those checks.

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
