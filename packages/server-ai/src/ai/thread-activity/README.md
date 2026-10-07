# Live conversation continuation

Runtime results can resume a conversation after the original request has ended.
This feature makes the resumed execution visible to an already open ChatKit
conversation and refreshes cards whose resource types opt into a ResourceCard Provider.

## Discovery and execution streams

`GET /api/ai/threads/:thread_id/stream` emits SSE `thread.snapshot` events using
the version 1 `ThreadActivitySnapshot` contract. Each event is a complete snapshot
of root executions, their status and message revision, and authorized resource card
projections. The first read runs immediately; subsequent reads run every two
seconds after the preceding read finishes. Unchanged snapshots are not emitted.
The event ID is a content hash, not a replay cursor. Reconnecting always reads
committed database state, including runs that finished while the client was away.

The activity stream carries discovery data rather than model tokens. ChatKit
joins each discovered execution through the existing run stream. Background
continuations request Redis stream persistence for both Assistant and Project
general-agent runs. A single producer writes `stream_start`, ordered payloads,
and finally `complete`. Disconnecting an observer does not cancel that producer.

Run joins accept a Redis `last-event-id` cursor. A trimmed prefix, expired
terminal stream, or unserializable payload causes a `stream_resync` instruction;
the client reconciles persisted conversation messages. Message revisions allow
the client to reconcile final messages even if execution completion becomes
visible before the last message update. Discovery never admits a new model run.

## Task cards

The project middleware emits a `resource_card` after explicit delegation. Task
creation uses the normal tool step; existing historical task cards remain readable.
Cards are stored in the message that emitted them. Discovery projects
the latest authorized status onto that existing message/card identity without
rewriting its historical title or inspecting the CLI for each viewer.

Task status and execution status remain separate: a successful execution is not
task acceptance. A card opens the existing Tasks and Timeline Workbench view.
This release does not add a task detail dialog or Coding CLI execution viewer.

`ThreadActivityService` reads runs and messages, binds stored resource cards to
their message/execution, and calls `RefreshConversationResourceCardsCommand`.
The message module owns the single generic command handler and SDK
`ResourceCardProviderRegistry`. Built-in and plugin providers register exact
namespace/type pairs. The project module supplies `ProjectTaskCardProvider`,
which owns initial card creation, refreshed presentation, project access,
task/invocation association checks and review verdicts. Dispatch and refresh both
use its `createCard()` method; emitting the card remains the tool’s responsibility.
The activity service does not import these business entities or rules.

Provider reads are batched and have a two-second deadline with an abort signal.
Malformed results and transient failures produce a refresh-failure description;
explicit forbidden/not-found results replace the stale status with unavailability.
Neither interrupts run discovery. Conversation access revocation still closes
observation. Resource identity and message bindings remain host-controlled.
Types without a provider retain their saved snapshot, including after uninstall.
See `packages/plugin-sdk/RESOURCE-CARDS.md` for the plugin interface and lifecycle.

Card emission failures do not roll back a committed task or delegation. Cards
missing because of an emission failure or a crash are not reconstructed from
assistant text, tool names, or historical task records.

## Access, dependencies, and operating limits

Conversation access is checked before opening discovery and on every snapshot.
Run joins recheck run access during observation. Project card reads also require
project access; execution projections match tenant, organization, conversation,
thread, invocation owner, parent execution, and the pinned task reference.
An inaccessible invocation exposes an unavailable card without provider details.

The workspace uses ChatKit packages `0.11.1`. ChatKit UI resolves Xpert SDK
`0.7.0`, including `threads.watchActivity()`. Web builds must serve the matching
ChatKit application assets together with the updated wrappers.

Snapshots currently scan all root executions and stored resource cards for the
thread. There is no pagination or activity outbox in this release. The existing
Redis retention settings still apply; persisted messages supply the fallback.

## Verification

Tests cover completed runs on reconnect, changed snapshots, subscription cleanup,
access revocation, card ownership and status projection, ordered Redis writes,
single execution production, and replay resynchronization. Tool tests verify
that card delivery errors preserve committed task/delegation outcomes.

For manual verification, keep the conversation open after delegating a task.
When the runtime finishes, its card should leave Running and the Assistant's
next turn should appear without a page refresh. Repeat after disconnecting and
reconnecting; completion must be reconciled without starting another execution.
