# Assistant Profile hover card and plugin views

Status: implemented and locally accepted on 2026-09-03. Approved on 2026-09-03.
See [implementation and acceptance evidence](QA_assistant_profile_hover_card.md).

## Goal and sequence

Implement the full Assistant Profile in the Xpert shared UI, integrate Assistant
avatars in the sidebars, connect Factory Operations cases and approval continuation, then
verify the installed platform and update product documentation and development
skills. Preserve unrelated working-tree changes in every repository.

## Confirmed product decisions

- The complete profile, tabs, and actions stay in one hover card.
- Cases belong to exact Assistant instances through explicit assignments and
  participation records, including published versions of the same instance.
- Plugins own Assistant-to-case authorization; the host must not infer this from
  names, templates, or automatically grant access through unrelated roles.
- Human readers require Case Project read access. Only Project owners and managers
  may approve or reject recovery plans.
- Approval queues automatic continuation until completion or another human gate.

## Platform UI

Import the official Zard Hover Card into the Angular shared UI package, adapting
imports, semantic tokens, and exports. Preserve delayed opening/closing, controlled
visibility, placement fallback, and pointer/focus continuity.

Add AssistantProfileComponent and a reusable trigger accepting assistantId and an
optional existing summary. Keep avatar, name, description, tags, and version above
tabs. Add compact indicators for available Skills, unique Tools, direct sub-agents,
and conversations in the rolling 30-day window. The default Basic information tab
shows available description, workspace, publisher, and dates. Use a 480px width and
640px maximum height constrained to the viewport, with a fixed header/tab bar and
independently scrolling content.

Use 350ms opening and 300ms closing delays. In the sidebar, only hovering an
Assistant avatar opens the card; hovering the surrounding menu item does not, and
there is no separate information icon. ChatKit does not add a standalone Profile
header row. Pointer/focus inside an iframe keeps the card open. Support explicit
close, Escape, and focus restoration without changing existing navigation clicks.
Inner approval dialogs handle Escape first. Pending submissions prevent automatic
dismissal.
Support English/Simplified Chinese, light/dark themes, and narrow screens.

## Public contracts and loading

- GET /xpert/:id/profile returns a whitelisted XpertAssistantProfile using published
  Assistant access checks. It includes host-computed indicators in the same response:
  installed Workspace Skills available through the normal runtime Workspace-access
  boundary, excluding Skills disabled for the Assistant binding; unique enabled Tools from direct Toolsets and
  Middleware; unique direct internal/External sub-agents; and non-debugger
  conversations over the same Assistant version family during the previous 30 days.
  Index the scoped Assistant/date conversation lookup used by this aggregate.
- Export AGENT_PROFILE_TABS_SLOT = 'agent.profile.tabs'; register the feature-gated
  tabs slot on the Agent View Host.
- Add typed, backend-only Assistant instance/family identity to resolved context.
- Reuse IXpertViewExtensionProvider and ViewRenderer for declarative and iframe
  views. Open loads profile/manifests; activating a tab calls getViewData; actions
  use executeViewAction. Backend identity comes from trusted host context.
- Never delegate Assistant identity or authentication to iframe inputs. Plugins
  receive business queries and return bounded DTOs and explicit allowed actions.
- Mount each extension tab on first use and cache the visited iframe until the
  Profile closes or the Assistant changes. Hidden tabs receive an inactive
  lifecycle signal, pause polling, retain UI/data state, and resume polling from
  the next interval when selected again. Discard obsolete asynchronous responses.
  Isolate extension failures and provide retry; Basic information remains available.
- Expose host Project read/manage checks through a typed backend runtime capability
  for human authorization, without imposing host Assistant-to-case policy.

## Factory Operations

Add Recent cases and Needs attention profile manifests with a common middleware
Feature and compact React entries. Resolve Assistant membership inside the plugin
from explicit assignments and requester/executor records. Apply tenant,
organization, human Project read access, and instance membership before counting
and pagination. Default to 10 rows ordered by last update. Show case/device,
severity, progress, recent activity, next step, and in-card detail/evidence.

Needs attention includes pending approval and blocked/failed continuation. Compute
allowedActions server-side. Introduce approve_and_continue with caseId,
baseRevision, operationId, and reason; return the approval receipt plus durable
continuation identity/state. Confirm the exact plan/revision, scope, and simulation
mode. Rejection requires a reason; cancellation writes nothing; retries reuse the
same idempotency key.

Enforce owner/manager authorization in the shared approval service used by both
Profile and Workbench. Agent tools never acquire human approval authority.
Persist approval and continuation intent atomically. A Managed Queue processor
executes the approved plan, dispatches the real verification Assistant Task through
the case coordinator, and checks the business finalizer before reporting success.
Use revision checks, stable step IDs, persistent checkpoints, bounded retries,
delayed status checks, and periodic outbox recovery. Stop at human gates, revoked
permissions, changed plans, missing bindings, or business failures. Closing the UI
or restarting the API does not lose approved work.

External mode remains blocked until actual adapters exist; simulation receipts
must never be described as production execution. Preserve old approval action
semantics; the new combined action opts into continuation.

## Data and compatibility

Save the coordinating Assistant on each Case and plugin-owned assignments returned
by Project provisioning. Add durable continuation storage and indexes with an
additive migration. Preserve Cases, audits, executions, and host Projects. Backfill
legacy coordinators only from a unique explicit requester record; unresolved cases
show a binding repair requirement. Split profile, governance, persistence, and
continuation responsibilities out of oversized service files.

## Acceptance

- Hover/focus/iframe continuity, nested confirmation, keyboard/touch, viewport
  positioning, themes, and cleanup.
- Lazy tabs, retry, fast Assistant switches, stale response rejection, Feature
  removal, action allowlists, and identity isolation.
- Different instances of the same role remain isolated. Cross-scope and unreadable
  Projects are hidden. Editors/members cannot approve. Stale revisions, duplicate
  requests, reject, and cancel behave predictably.
- Approval followed by closing the card still runs a real verification Assistant
  Task and produces persisted business/audit evidence. Exercise restart recovery,
  queue failure, revocation, missing bindings, and external-mode blocking.
- Platform targeted tests/build; plugin typecheck, unit/integration/E2E, generated
  asset checks, plugin-dev-harness lifecycle, and installed-platform browser
  verification. Record actual evidence and limitations honestly without retaining
  screenshots in the repository.

## Documentation

After implementation, update the English and Simplified Chinese product pages and
View Extension SDK docs in the product documentation repository, navigation, and
Factory Operations usage/acceptance docs. Add assistant-profile-views.md under the
Agentic App development skill references, link from relevant skills, and validate
the skills. Examples cover slot/Feature declarations, trusted context, plugin-owned
Assistant access, human Project permissions, queries/actions, lifecycle, and durable
approval continuation. Use portable paths and no credentials.

## Sources

- https://zardui.com/docs/components/hover-card
- https://ui.shadcn.com/docs/components/base/hover-card

## Delivered implementation

- Shared Zard Hover Card and Assistant Profile are implemented on Assistant avatars
  in the expanded and collapsed sidebars. Chat headers retain their existing menu
  behavior and do not add a Profile information button or separate header row.
- Basic information labels the existing `createdBy` relation as **creator**. There
  is no separate publisher relation, so it is not presented as publisher identity.
- The fixed header includes Skills, Tools, sub-agents, and rolling 30-day conversation
  indicators. Skills represent the accessible installed inventory in the Assistant's
  Workspace and do not require the primary Agent to mount Skills Middleware. Optional activity sources degrade to an em dash without making the
  rest of the Profile unavailable.
- `agent.profile.tabs`, the whitelisted profile endpoint, version-family identity,
  scoped Project access runtime capability, active-tab teardown, opaque-origin
  Remote Views, and scoped interaction/close commands are implemented.
- Project Access owns and registers its runtime capability through the shared Plugin
  SDK registry token. The Agent middleware runtime exposes the registry abstraction
  without importing Project modules or implementations.
- Factory Operations 0.5.0 provides Recent cases and Needs attention, shared human
  approval governance, additive continuation storage, atomic outbox persistence,
  checkpointed Managed Queue execution, and real verification Assistant Tasks.
  Existing explicit Project bindings also identify legacy Case assignments.
- English/Chinese product and SDK pages, navigation, Factory Operations operator
  documentation, and the Agentic App skill reference are updated.
- Local installation is active on this checkout's API 3333 and UI 4300. Its
  `MANAGED_QUEUE_PREFIX` is isolated from the other running checkout to prevent
  workers from consuming each other's jobs.
- Contracts, plugin SDK, and UI changes have a changeset. The plugin currently uses
  the paired local platform build; public distribution must follow the coordinated
  SDK/contracts release. No package or site was published during this task.

Validation includes real UI approval followed by closing the card, a completed
verification Assistant Task and persisted `recovered` Case/audits. Fault injection
uses an isolated PostgreSQL test database with a stub at the platform Task boundary.
The View Extension normalizer now derives `runtime.featureProviders` from trusted
Project capabilities and exposes only Assistants that provide every required
Feature. Details and the exact scope of each validation are in the acceptance
record above.
