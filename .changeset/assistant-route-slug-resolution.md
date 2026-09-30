---
'@xpert-ai/server-ai': patch
---

fix(server-ai): resolve assistant routes by slug as well as id

The workspace routes address assistants by slug (`/xpert/x/:slug`), but the
matching route params are named `id`, so the slug reaches server code that uses
it directly as a primary key. `XpertGuard`, `XpertService.getTeam` and
`XpertService.allVersions` all did that, and Postgres rejected the value with
`invalid input syntax for type uuid`, so the assistant page returned 500 and
could not be opened at all.

Adds `XpertService.findOneByIdOrSlug()`, which picks `id` or `slug` via
`UUID_PATTERN` (the same approach as the existing `findPublicChatAppXpert`),
and routes `getTeam`, `allVersions` and the guard through it. The guard needs
it too, otherwise it fails before the handler runs. Covered by
`xpert.guard.spec.ts` and new cases in `xpert.service.spec.ts`.
