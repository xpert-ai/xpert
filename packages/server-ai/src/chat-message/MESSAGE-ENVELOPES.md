# Host message provenance and presentation

`TChatMessageEnvelope` describes who produced an input and how it appears in a
conversation. It is not a command, model role, runtime principal, routing request,
or permission grant. Execution remains in `XpertChatCommand`, the handoff queue
and the existing Agent invocation/task runtime.

## Contract

- `version`: currently `1`.
- `source`: explicit `user`, `voice`, `assistant`, `agent` or `automation` source.
  An Agent key is scoped to its `xpertId`; a voice source identifies its session.
- `target`: optional host-resolved Assistant/Agent and conversation/thread snapshot.
  The actual authorized command determines the destination.
- `correlation`: optional originating message, execution, invocation and task IDs.
  Reuse existing invocation identities instead of introducing another task ledger.
- `presentation`: `message` for ordinary transcript content, `event` for visible
  activity, or `runtime` for input excluded from public history. Source alone
  never implies that a message should be hidden.

Presentation does not remove input from model ancestry or retries. Display-only
receipts such as `call_ended` keep their existing, separate timeline storage path;
marking an executable input `event` does not make it display-only or prevent a run.
Frontend treatment of new Agent activity events belongs to the future messaging
feature; this change preserves the envelope in API projections.

## Boundaries and persistence

Trusted producers set `options.messageEnvelope`. The chat command validates it
once on entry (including queue delivery) and stores it in the dedicated nullable
`ChatMessage.messageEnvelope` JSONB column, typed as `TChatMessageEnvelope`.
Apply `migrations/20261005-message-envelope.sql` before deploying this feature.
Third-party message payloads do not determine host provenance or presentation.
Do not put prompt text, credentials or authorization claims in the envelope.

HTTP history, message lookup, recursive history paging and streamed input
acknowledgments use the same presentation policy. Visible HTTP/SSE projections
expose a validated `messageEnvelope`; parent/child objects are not an alternative
way to expose runtime inputs. Public message mutations exclude this field from
their write allowlist, preserving existing host provenance. Branch copies retain
the original envelope, including its audited destination and correlation.

`messageEnvelope` is the sole provenance and presentation contract for persisted
messages and queued dispatches. Invalid or unknown persisted presentation versions stay
hidden from public history. Runtime hydration preserves them for execution and
diagnosis. Envelopes with valid version/presentation do not use source heuristics
for visibility; malformed provenance is omitted from the public projection.

## Current producer and extension path

Realtime voice is the first producer: source `voice`, presentation `runtime`,
resolved target and task/execution correlation. Hanging up still does not cancel
the delegated task.

Assistant/Agent messaging can use the same envelope when its transport is added.
Resolve sender and destination from trusted runtime scope, authorize the target,
reuse `AgentInvocationScope`/task identities where applicable, and apply existing
send/queue/steer rules. Reply correlation and idempotent delivery must be handled
by that transport. The envelope alone does not implement cross-Agent messaging,
and an Agent-sourced message must not acquire user or system authority merely
because the underlying model adapter serializes it as an input message.
