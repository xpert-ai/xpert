# AGENTS Guide for Xpert

This repo uses NestJS + TypeORM on the server and Angular 17 (standalone, signals, new control flow) on the client. Follow these rules when extending the codebase.

## General

- Prefer `rg` for search; keep edits ASCII; do not revert user changes.
- Avoid Angular Material (deprecated). Use Angular CDK + TailwindCSS v3 for UI. Do not import `@angular/material` modules in new code.
- Use standalone Angular components with signals, the new control flow like `@for/@if`, and reactive forms. Keep templates Tailwind-first.
- Keep comments succinct; add only when clarifying non-obvious logic.

## Backend (NestJS)

- Patterns: entities in `packages/server-ai/src/**`, services extend `TenantOrganizationAwareCrudService` or base classes, controllers extend `CrudController` when possible.
- Register modules in `packages/server-ai/src/index.ts` and wire into `app.module.ts` as needed.
- Keep TypeORM entities aligned with contract interfaces in `packages/contracts`.
- Complex, independent logic can be implemented using CQRS.

## Frontend (Angular)

- Services live in `apps/cloud/src/app/@core/services`; export them via the barrel.
- New settings pages belong under `apps/cloud/src/app/features/setting/**`, use standalone components and lazy routing files exporting `routes`.
- Use signals/models for state, prefer `getAllInOrg` patterns for org-scoped data.
- Styling: Tailwind utility classes in templates; SCSS only for minimal host tweaks.
- Use translate for text in html.
- Support light/dark modes via Tailwind CSS classes.

## API Endpoints

- Server skill repositories: `POST /skill-repository` to register, `GET /skill-repository` list, indexes at `/skill-repository/indexes` with `POST /sync/:repositoryId`.
- Match client services to these REST shapes; keep organization/tenant context via base services.

## Testing & Validation

- Run targeted tests when possible; otherwise state when not run.
- Validate forms with Angular `Validators`, show errors via Toastr and `getErrorMessage`.

## UX Notes

- Follow the bold, terminal-inspired aesthetic used in the skill repository page: gradient shells, code-like cards, and clear CTAs.
- Provide loading/empty states; support search/filter/sort when dealing with lists.
