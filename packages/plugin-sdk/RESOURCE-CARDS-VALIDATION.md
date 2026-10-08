# Resource Card validation — 2026-09-30

## Implemented behavior

- Additive Resource Card protocol, allowlisted targets, stable per-reply deduplication, server-bound identities, streaming/history content, separate reply-bottom rendering and click-only Workbench navigation.
- Immediate best-effort scheduler receipt persistence; display errors are logged without changing an already successful creation result.
- Feature-gated scheduler detail View: authorized data/actions, edit/save, pause/resume, execution history and navigation. The View uses existing task services and built Remote Component assets.
- Optional public Project provider receipts, transactional pending metadata and atomic first-reply delivery. Bid uses platform Project IDs and keeps manual creation/business navigation independent.

## Checks completed

- ChatKit UI: the full suite passed (131 files / 1,240 tests). After navigation restoration and stream tests were added, the focused protocol/card/Workbench/navigation suites passed (57 tests) and the stream/replay suite passed (3 tests).
- Backend: 20 resource-card/scheduler/delivery tests passed. Existing chat handler plus Project creation/provider suites passed (83 tests), including new receipt assertions. Cloud navigation authorization tests passed (8 tests).
- Bid: Project provider/creation tests passed (12 tests), plugin build passed, `verify:dist` passed, backend typecheck passed. These consume the sibling built public contracts and plugin-sdk through the existing workspace overrides.
- Xpert SDK: package build and View Host client tests passed (9 tests).
- Type checks: ChatKit UI, platform server-ai, Cloud and scheduler Remote Component passed. The broader server regression also passed against the newly built local ChatKit declarations; TypeORM's recursive JSON update boundary was narrowed without weakening the public method contract.
- Builds: ChatKit types/UI app and library, Xpert SDK, contracts, plugin-sdk and Bid passed. Scheduler and existing project-task Remote Component generated assets passed byte-for-byte freshness checks using `build.mjs --check`.
- Platform's temporary parser copy and ChatKit parser produce identical normalized JavaScript.
- All four repositories passed `git diff --check`.

## Browser evidence

`chatkit-js/packages/chatkit-ui/resource-card-preview` builds the actual card renderer, command executor, Xpert SDK client and iframe bridge. It loads verified production scheduler/project-task assets. **The API data and Project session in this fixture are simulated.**

Playwright verified explicit click and keyboard Enter; scheduler edit/save, pause/resume, execution navigation; successive task selections and retained per-task unsaved drafts; browser Back/Forward and refresh; platform Project target opening the existing task timeline. Screenshots were visually inspected for Chinese/light, English/dark, a 430px panel and long titles:

- `chatkit-js/output/playwright/resource-card-zh-light.png`
- `chatkit-js/output/playwright/resource-card-en-dark.png`
- `chatkit-js/output/playwright/resource-card-narrow.png`
- `chatkit-js/output/playwright/resource-card-project.png`

## Runtime/release boundary

The selected local Xpert source environment passed the environment inspector: API readiness at port 3000, Cloud at port 4200, correct checkout provenance, Bid workspace allowlisted. This proves environment health only.

No npm release or production deployment occurred. The platform's installed ChatKit catalog remains 0.7.0; a packaged release must upgrade it to the release containing these companion changes. Bid declares the upcoming contracts/plugin-sdk 3.19.0 baseline and uses local workspace overrides for validation.

On 2026-09-30, at the user's request, Bid 0.4.97 was rebuilt, packed and refreshed in the local Default tenant. The API was restarted from the current Xpert source, and authenticated checks confirmed the plugin was loaded, the Bid View manifest/data and Remote Component entry were available, and the Project middleware tool schemas resolved. The 12 Project tests, `verify:dist`, contracts/plugin-sdk builds and local environment inspector passed. Cloud on port 4200 serves the new card navigation code and uses the existing ChatKit source server on port 5173, where the new card renderer and public parser helpers are available. This is a source development deployment; the host SDK metadata remains 3.18.7 and therefore emits a compatibility warning against Bid's forthcoming 3.19.0 release baseline.

The package and secret-free deployment/runtime receipts are under `/Users/lilinhao/tiwen/.xpert-local-environment/bid-resource-cards-20260930/`. The user test entry is `http://localhost:4200/chat/x/bid-studio-5cb148df/c`.

A real authenticated Agent creating resources through the running platform and PostgreSQL, then navigating in that same deployed Cloud build, has **not** been accepted end to end; the user will perform that acceptance. Transaction/concurrency/rollback tests use repository doubles; the browser evidence above uses fixture APIs. The authenticated deployment smoke checks prove availability of the loaded plugin and its endpoints, not acceptance of the full conversation flow.

## Project card navigation regression — 2026-09-30

The original host path treated an `assistant.project` card with a View as a workspace switch. That cleared the active conversation and first-send Project adoption, dropped the thread from the route, and changed the ChatKit mount binding. Project Views now own an independently authorized `projectScope` on their host tabs. The `viewProject` query parameter restores the View without changing the conversation route; card authorization resolves manifests in the persisted card's target Project scope.

- Seven focused Cloud suites passed: 178 tests covering card authorization, independent Project tabs, first-send adoption, retained conversation/control/mount, runtime scope propagation, stale requests, URL recovery and Back/Forward. Cloud application typecheck and `git diff --check` passed.
- Actual source environment: authenticated Cloud 4200 + ChatKit 5173 + API 3000 loaded an existing Bid conversation and restored its scoped `platform.project-tasks__timeline` View with the original thread and history present. The real Remote Component loaded the target Project's task panel. Screenshot: `/Users/lilinhao/tiwen/.xpert-local-environment/bid-resource-cards-20260930/project-view-conversation-retained.png`.
- Browser automation could not reliably activate controls inside the ChatKit iframe (`Click target is no longer available` / unavailable keyboard focus root). The real card-click-and-draft-retention path is therefore **not claimed as browser-verified**; it is covered by the host regression tests and remains a manual acceptance check. No new Agent request or business object was created during this verification.
- This fix is in Cloud host navigation and is loaded by the local source development server. Bid does not require repacking for this change. No npm publication or production deployment occurred.
