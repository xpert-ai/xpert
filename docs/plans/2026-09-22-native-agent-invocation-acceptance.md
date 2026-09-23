# Native Agent Invocation Acceptance

Date: 2026-09-22

Related design: [Unified Agent Invocation](2026-09-22-unified-agent-invocation.md).

## Result

Native sub-agent and published external Assistant calls passed six live scenarios
against the source API, in addition to 42 focused automated tests. The separate
invocation inspection API defect was subsequently fixed and verified below. This is not acceptance of the
third-party Agent runtime providers or of every recovery scenario.

No production runtime source was changed during the initial acceptance run. The
follow-up fix below changes inspection routing and adds regression coverage.

## Environment and fixtures

- Source checkout: `xpert`, branch `develop`, base commit
  `204943327a4f5c201d5dbbf00760abf9f61c5dba`, with existing uncommitted changes.
- Source API: `http://localhost:3333`; Cloud UI: `http://localhost:4300`.
  Readiness passed and both listeners were traced to the selected checkout.
- Authentication used the platform local CLI helper and configured credentials.
  Organization and authoring workspace access were verified through scoped APIs.
- Model: existing `qwen3.6-plus` configuration; no provider credentials or global
  model settings were changed.
- Two uniquely named test Assistants were created and published: an external
  worker and a coordinator with one local follower and one required external
  Assistant connection. No business Assistant was edited.
- Both workers declared a required structured `token` parameter and returned a
  distinct `LOCAL_OK:` or `EXTERNAL_OK:` marker containing that invocation's token.
  No worker had business tools or middleware attached.

## Live scenarios

| Scenario                                                 | Result | Evidence                                                                                                                                |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Local sub-agent, fresh conversation                      | Passed | Exactly one `sub_agent` execution, correct target Agent and parent, structured token preserved, exact child result persisted            |
| Published external Assistant, fresh conversation         | Passed | Exactly one `external_assistant` execution belonging to the separately published Assistant, correct parent, structured token and result |
| Local sub-agent, second turn in the same conversation    | Passed | New root and child execution; current token returned instead of the previous result                                                     |
| External Assistant, second turn in the same conversation | Passed | New root and child execution; current token returned instead of the previous result                                                     |
| Local sub-agent, pause before calling and confirm        | Passed | Root interrupted before child creation; confirmation resumed the same root and produced exactly one successful child                    |
| External Assistant, pause before calling and confirm     | Passed | Root interrupted before child creation; confirmation resumed the same root and produced exactly one successful child                    |

All six child execution IDs were distinct. Each persisted parent execution
finished with `success` and exactly one intended child. Verification used the
execution log API and SSE Agent events, rather than the model's answer alone.

Requests used the published `POST /api/xpert/:slug/chat-app` route. Continuation
used the existing conversation ID. Resume used `action: resume`, the interrupted
execution target, and `decision.type: confirm`. Authoritative execution evidence
was fetched through `GET /api/xpert-agent-execution/:id/log` with child relations.

## Automated regression

Four suites / 42 tests passed:

```sh
corepack pnpm exec jest --config packages/server-ai/jest.config.ts \
  --runInBand --silent --runTestsByPath \
  packages/server-ai/src/xpert-agent/commands/handlers/subgraph.handler.spec.ts \
  packages/server-ai/src/xpert-agent/collaborators/collaborators.integration.spec.ts \
  packages/server-ai/src/xpert-agent/collaborators/collaborators.middleware.spec.ts \
  packages/server-ai/src/agent-invocation/assistant-task-adapter.spec.ts
```

These tests cover additional permission, cancellation, tool-conflict and nested
interrupt cases using mocked dependencies. Those cases must not be described as
live model or live permission-revocation acceptance.

## Resolved defect: native invocation inspection returned HTTP 500

Calling `GET /api/agent-invocations/:id` with either native child's invocation ID
originally returned HTTP 500. The established execution log route succeeded.

The old controller found the owner-scoped invocation, then reconstructed the external
binding API through `AgentInvocationFactoryService`. Its authorization resolver
queries `AgentRuntimeBindingEntity.id`, a UUID column, using a native logical
binding such as `xpert:<assistant-id>:<entry>`. PostgreSQL rejects that value with
`invalid input syntax for type uuid`.

Relevant code:

- `packages/server-ai/src/agent-invocation/invocations.controller.ts`
- `packages/server-ai/src/agent-invocation/invocation-factory.service.ts`
- `packages/server-ai/src/agent-invocation/invocation-runtime.ts`

The fix dispatches by the stored provider field. `NativeAgentInvocationReader`
returns the native graph/Task observation after current caller/target Assistant,
tenant, workspace, optional project, and native parent execution access checks.
The controller first checks authenticated owner, tenant and organization, including
agreement between the entity columns and the stored JSON scope. It does not
fabricate a UUID, query the external binding table or restart native execution.

External binding resolution now rejects non-UUID IDs before querying storage.
Native cancel/respond requests on the external control route explicitly return
HTTP 422; native graphs and Tasks continue using their existing control routes.

Follow-up verification:

- Backend TypeScript check passed.
- Six focused suites / 70 tests passed, including the four suites above plus
  `invocations.controller.spec.ts` and `invocation-factory.spec.ts`.
- Native sub-agent and published external Assistant were invoked again using fresh
  fixtures and the same configured model. Both persisted successful child results.
- Both invocation GET requests returned HTTP 200 with `status: succeeded`.
- Repeated GETs returned the same revision and observation without side effects.
- Native cancel on this endpoint returned HTTP 422 for both calls.
- Unit coverage includes owner/tenant/organization isolation, workspace changes,
  Assistant and project permission revocation, native Task snapshots, non-terminal
  observation reads, and preservation of external provider routing.

The source API automatically reloaded the fix through its existing development
watcher. No database migration or frontend change was needed.

## Scope and cleanup

The initial fixture Assistants and four test conversations were removed using
ordinary platform APIs after evidence collection. The follow-up fix verification
also removes its two fresh Assistants and two test conversations. Private local receipts and SSE evidence
retain instance identifiers; no tenant, organization, workspace, Assistant or
conversation IDs are included in this document.

This run did not test third-party coding agents, process crashes, worker failover,
live permission revocation, or a human interrupt raised inside a nested child.
The checked-in tests cover some of these control semantics with mocks; those
results do not establish production recovery guarantees.
