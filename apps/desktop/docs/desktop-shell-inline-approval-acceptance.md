# Inline Desktop Shell approval acceptance — 2026-09-28

## Scope and rollout

Shared implementation is in xpert and synchronized to xpert-pro; generic approval UI and host callbacks are in chatkit-js. The local xpert-pro API and native Bosi development app were updated together. No packages have been published for this upgrade.

The additive `20260928-desktop-shell-approval.sql` migration was applied to the local development database. For other installations, deploy the server, Desktop and matching ChatKit packages together and apply the migration before starting the upgraded service. Old conversation grants do not grant automatic execution rights.

The Bosi local Assistant template is version 2. Its opener and prompt now describe on-demand connection and inline permission, and stop on refusal or unavailable devices. The dedicated onboarding Assistant was updated and published through the scoped API while preserving its model configuration. The local external catalog template was updated only after confirming semantic equality with the unmodified version 1 template. Other deployments must explicitly synchronize their external template and installed Assistants; source updates alone do not overwrite local templates.

## Verified behavior

- A real published Agent requested a command; the native controller connected on demand and prepared a pending permit. No file existed before approval.
- After approval and worker acknowledgement, the command executed on macOS. The test checked cwd, stdout, stderr, exit code and exactly one appended line in a temporary file.
- A separate real Agent request was refused. No operation was dispatched, no file was written and the Agent did not request the command again.
- Fixtures used temporary directories and were removed; test devices were disabled and permits revoked.
- Native controller, delivery, protocol and engine regression: 31 tests passed, covering policy scope, parameter integrity, expiry, refusal, worker acknowledgements and duplicate execution prevention.
- Backend regression: 43 tests passed, including consecutive persisted interrupts, dynamic tool approval emission, scoped grants, operation authorization and the Assistant template.
- ChatKit targeted approval/HITL tests passed. Component previews were checked in light/dark themes and at 390px width; approval and refusal buttons were exercised.
- Desktop build, ChatKit app and web-component builds, server and ChatKit type checking passed. Bosi was restarted; the Cloud-hosted frame matches the new ChatKit build.

Two integration defects were fixed during real execution: interrupt/resume checkpoint writes require separate reserved indices, and resumed dynamic tools can have explicit pending interrupts while `next` is empty. The smoke runner also now sends `Last-Event-ID` when resuming a persisted stream.

## Manual acceptance

The automated runner and component previews were followed by a user-operated manual click-through in native Bosi on 2026-09-28. The user confirmed all four scenarios passed:

- 1A/1B - Ask per command: no manual connection banner, an inline approval appears before execution, allowing once executes the requested command, and the next command requires a new approval.
- 2 - Reject: the pending command does not execute; the Assistant stops without retrying or falling back to a cloud Shell.
- 3 - Always allow: the scoped policy skips approval and executes `uname -s`, returning `Darwin`.
- 4 - Deny: `pwd` is blocked without an approval card or native execution; the Assistant stops without a cloud fallback.

The user was instructed to restore Ask per command after testing. The final stored policy was not independently inspected.

## Verification limits

The full ChatKit UI suite reported 2 SDK sandbox-route assertion failures in `src/lib/sdk-runtime.test.ts` (expected `/api/ai/sandbox/…`, installed SDK produces `/api/sandbox/…`); the targeted approval suite passes. These failures were not changed as part of this work.

This validation does not cover signed packaging, production deployment, OS sleep/wake or production multi-node failover. Pending approval cards are transient; completed commands use the existing tool-result history.
