# Message skill usage

## Plan and scope

Record the registered skills whose main instructions are successfully read while
an assistant produces a message, persist those observations on the message, and
display the names and origins in the ChatKit message footer. Selection or
installation alone is not evidence of use. This records loading, not proof that
the model obeyed the instructions.

The cross-repository implementation plan was recorded before code changes in
`chatkit-js/docs/message-skill-usage.md`. Platform implementation lives in this
repository; the shared contract, frontend, and release changeset live in
`chatkit-js`.

## Platform implementation

- `skills-middleware/skill-usage.ts` snapshots canonical identity and origin from
  the effective registry, never from model-written prose or shell command parsing.
- `read_skill_file` returns the instructions as content and a typed observation as
  the LangChain tool artifact, only after successfully reading a registered main
  `SKILL.md`. Local resource, sandbox, and fallback reads share this logic.
- `xpert-agent/agent.ts` attaches observations to successful tool components after
  checking tool name and tool-call identity.
- `chat-message/task-summary.ts` aggregates all observations into the existing JSON
  summary, preserves earlier plan/output contributions, and deduplicates repeated
  skill reads. No database migration is required.
- Public conversation message mutations strip client-authored skill observations.

## Validation and rollout

Focused tests exercise the actual middleware, stream mapper, content reducer and
message upsert handler with mocked IO boundaries, including failures, concurrency,
history restoration, regeneration and origin attribution. ChatKit separately
tests live/persisted normalization and footer interactions.

All 92 tests across 11 focused backend suites passed. ChatKit passed 996 tests in
its initial full regression and the two subsequently added history/grouping cases;
the shared types and UI library builds and UI TypeScript checks also passed.

Xpert now resolves the published `@xpert-ai/chatkit-types@0.6.2` and
`@xpert-ai/chatkit-ui@0.6.2` packages, including `@xpert-ai/xpert-sdk@0.4.1`.
The release verification replaced the earlier local workspace links and checked
the exported contracts and packaged iframe assets. See
[ChatKit 0.6.2 upgrade review](chatkit-0.6.2-upgrade-review.md) for current evidence.
Merge these platform changes into `xpert-pro` with the corresponding dependency
and lockfile updates.

Old messages have no reconstructable observations. Arbitrary shell reads and
unregistered skills are outside the first version. The initial implementation
did not change API/Cloud processes; the subsequent acceptance run is recorded below.

## Local acceptance — 2026-09-23

The API (3000) and Cloud (4200) were verified to run from this `xpert` checkout,
with the latest linked local ChatKit app. Only existing, previously authorized
PostgreSQL and Redis infrastructure was reused from the `xpert-pro` environment.
No `xpert-pro` source was modified and no package was published.

- Re-ran 10 focused backend suites / 53 tests and three UI suites / 85 tests:
  all passed. The ChatKit app build passed.
- Real LLM and API: three successful main-file reads (including a duplicate) and
  one failed read persisted exactly two skills, with Plugin source attribution.
- Merely selected skills, names appearing in reply text, a successful non-main
  reference-file read and a subsequent no-tool turn all produced no observations.
- Browser verified the two skill rows, source labels, Enter/Escape interaction,
  live completion and history reload. Four successive answers persisted counts
  `2, 0, 0, 2`, including a model claim of successful reading without tool calls
  which correctly produced no Skills control.
- Concurrency, regeneration, branching and child-agent aggregation were exercised
  by automated tests; they were not all repeated through the live UI.

Two environmental issues were distinguished from feature behavior. First,
`/chatkit` was serving the Cloud fallback HTML and recursively embedding Cloud.
Rebuilding ChatKit's `dist/app` and restarting this Cloud restored the correct
document and HTTP 200 JavaScript/CSS. A clean library build can remove `dist/app`,
so the app build must follow it before starting Cloud. This process overrides the
shared `.env` frame URL with `/chatkit`; `.env` itself was preserved.

Second, the existing Exa/Notion package records referred to missing local files.
Their failed reads correctly produced no usage metadata. Successful acceptance
used a separate test package with two inert Markdown skills and no executable or
external components, imported and scoped through normal authorized APIs. Existing
Exa/Notion installation health remains a separate environment issue. Raw receipts
and machine-specific IDs remain in the protected local environment folder.
The test-only resource binding was disabled after acceptance, with test messages
retained for review. Existing bindings and Assistant configuration were preserved.
