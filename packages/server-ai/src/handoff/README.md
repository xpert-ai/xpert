# Handoff

This module processes handoff messages asynchronously with Bull queues.  
It now supports internal stop/cancel by `messageId` and `executionId`, covering both queued and active jobs.

## Cancellation Principles

Cancellation is cooperative.  
The system signals cancellation through `AbortSignal`; it does not force-kill synchronous CPU-bound code.

- Queued jobs (`waiting`, `delayed`, `paused`) are canceled by removing Bull jobs.
- Active jobs (`active`) are canceled by aborting the in-flight processor context.
- Cancellation is represented as `dead` with reason prefix `canceled:`.
- Canceled results do not go to dead-letter and are not retried.

## Key Components

- `StopHandoffMessageCommand` + `StopHandoffMessageHandler`
  - Internal stop entry point (CQRS command).
  - Accepts `messageIds[]`, `executionIds[]`, `reason?`.
  - Returns a summary: `requested`, `matched`, `removed`, `aborted`, `notFound`.

- `HandoffQueueGatewayService`
  - Scans all handoff queues and states (`waiting`, `delayed`, `paused`, `active`).
  - Matches jobs by `message.id` and/or `payload.executionId`.
  - Removes queued jobs for immediate cancel effect.

- `HandoffCancelService`
  - Maintains in-process `messageId -> AbortController` registry.
  - Uses Redis pub/sub channel `ai:handoff:cancel` for cross-instance cancellation.
  - On cancel, stores normalized reason and calls `AbortController.abort()`.

- `MessageDispatcherService`
  - Registers `AbortController` before processor execution and unregisters in `finally`.
  - Passes `abortSignal` into processor context.
  - If aborted (or abort-like error), normalizes result to `dead(canceled:...)`.

- `HandoffPendingResultService`
  - Cancels local waiters (`enqueueAndWait`) so callers return immediately after stop.

- `message-queue.processor`
  - Treats canceled outcomes specially:
  - `dead(canceled:...)` is resolved to waiter, but skipped from dead-letter.
  - Abort-like errors are converted to canceled dead result (no retry).

## Stop Flow

1. A caller executes `StopHandoffMessageCommand` with `messageIds` and/or `executionIds`.
2. Handler scans queue states to find matching jobs.
3. Queued matches are removed from Bull.
4. For removed local task messages, task cleanup is attempted (`LocalQueueTaskService.remove`).
5. Active matches are sent to `HandoffCancelService.cancelMessages(...)`, which:
   - publishes cancel event via Redis (cross-instance),
   - aborts locally registered controllers.
6. All matched `messageIds` are canceled in `HandoffPendingResultService`.
7. Handler returns a structured summary for caller-side decision making.

## Cancel Reason Conventions

- `buildCanceledReason(reason?)` -> `canceled:<reason>`
- `isCanceledReason(reason)` checks prefix.
- `isAbortLikeError(error)` maps abort/cancel exceptions into canceled flow.

This keeps cancellation classification stable across dispatcher, queue processor, and command handler.

## Design Tradeoffs

- Queue lookup uses scanning instead of Redis index keys.
  - Simpler and reliable for low-frequency stop requests.
  - Cost is proportional to current job volume.

- Active cancel is best-effort and race-sensitive.
  - If a job finishes between scan and abort delivery, it may complete normally.

## Conversation Cancel Integration

`CancelConversationHandler` invokes execution cancellation first, then best-effort executes `StopHandoffMessageCommand` with `executionIds`.  
Failure in handoff stop is logged as warning and does not block conversation cancel flow.
