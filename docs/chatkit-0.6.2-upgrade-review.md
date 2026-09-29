# ChatKit 0.6.2 upgrade review

Date: 2026-09-23

## Dependency update

Updated the Cloud, contracts, draft plugin and server-ai package manifests to
`@xpert-ai/chatkit-types@0.6.2`, and Cloud to
`@xpert-ai/chatkit-ui@0.6.2`. The deployment webapp manifest carries the same
types/UI update. Existing tilde/exact version policies are preserved.
The lockfile resolves a single types version throughout the ChatKit graph and
updates the UI's SDK dependency to `@xpert-ai/xpert-sdk@0.4.1`.

Installation used Corepack pnpm 10.24.0 with the frozen lockfile. Installed
packages are registry artifacts, not links to the neighboring ChatKit checkout.
The types package exports `normalizeThreadReference`, `normalizeChatSkillUsages`
and `getMessageSkillUsages`; the UI package includes `dist/app/index.html`.
Unrelated lockfile changes were excluded. Install lifecycle scripts were skipped.

## Review scope and result

Reviewed the pending platform changes, including untracked implementation and
test files, for conversation references and message skill usage. No new actionable
blocking defect was identified in this review.

- References: Cloud and backend normalize thread locators without accepting
  client-supplied transcripts; title search is case insensitive.
- Middleware: `read_thread` is visible only when current input or visible branch
  history contains references, while its executor remains available for steering.
- Access: each read rechecks the source and destination, tenant/organization,
  public Assistant scope and destination audience; arbitrary and mismatched
  conversation/thread pairs are rejected.
- Pagination: parent-chain traversal preserves branch boundaries; short Redis
  handles bind actor, destination and source, expire after 30 minutes and never
  cache access decisions. Reads have row, turn, output and character limits.
- Skills: successful registered main-file reads create structured observations;
  tool identity is checked before stream attribution. Summary extraction deduplicates
  observations and preserves plan/output contributions. Public message writes strip
  client-authored skill observations.

## Validation

| Check                                                                                    | Result           |
| ---------------------------------------------------------------------------------------- | ---------------- |
| Backend contract, service, middleware, summary and controller regression                 | 123 tests passed |
| Agent stream, skills middleware and runtime resource regression                          | 45 tests passed  |
| PostgreSQL branch traversal and middleware/service integration; Redis cursor integration | 13 tests passed  |
| Cloud reference adapter                                                                  | 3 tests passed   |
| server-ai TypeScript, no emit                                                            | Passed           |
| Cloud Angular template/type compilation, no emit                                         | Passed           |
| Frozen lockfile installation and diff whitespace check                                   | Passed           |

The three PostgreSQL tests skipped in the initial regression were subsequently
run successfully with the integration group. In total, 184 distinct tests passed.
PostgreSQL used a disposable test database removed after the run; Redis tests
removed their own keys. Application schemas and business records were preserved.

Cloud was restarted from this `xpert` checkout with the existing local port/API
overrides and `/chatkit` frame URL; the shared `.env` was preserved. The served
ChatKit HTML exactly matches the installed release, and its JavaScript and CSS
return HTTP 200 with the correct content types.

Browser verification after refresh confirmed the Skills control on the two
recorded tool-using answers, no control on the two answers without observations,
and the two skill names with Plugin source labels in the keyboard-opened popover.
Typing `@Skills` returned matching conversation titles; selecting a result inserted
a reference token, and Enter on its remove button cleared it without submitting
a message. The composer was left empty. API health also returned HTTP 200, and
both API and Cloud listener working directories were verified as this checkout.

This is targeted upgrade validation, not a full monorepo test, lint or production
build. No new model run was submitted in this review; earlier live LLM acceptance
is recorded in [message skill usage](message-skill-usage.md). Deployment still
requires the pending platform implementation together with the dependency update.
Message keyword search remains outside the agreed scope.
