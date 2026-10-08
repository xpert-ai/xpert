# Reliable Runtime replies

Invocation remains the runtime ledger. Project Tasks retain business decisions. This host infrastructure uses the existing Handoff queues with persisted outbox, inbox and consumer claims; it does not register another executor or infer Task completion from transport success.

## Commit and recovery boundaries

1. `TypeOrmAgentInvocationStore` commits the observation and `agent_runtime_delivery` in one transaction. Result and input-request events contain references only. Progress stays in Invocation observations and does not wake the parent.
2. The transport worker restores the original actor from current tenant membership, rechecks the binding and recipient, and enqueues the stable event ID. Enqueue does not acknowledge receipt. A lost acknowledgement causes the same notification to be resent.
3. `RuntimeMessageProcessor` validates against the existing outbox, authorizes the pinned recipient, and commits the inbox plus received acknowledgement together. Input requests remain blocked notifications; they cannot approve an interaction. Resolved requests are superseded by the final result.
4. Bounded waits and asynchronous follow-ups share the scoped unique result-consumption key. Status reads do not claim results. A wait records its current parent execution; a follow-up reserves a new execution in the same transaction as its inbox claim and thread writer.
5. Busy threads leave results pending. Idle threads receive a new `send` turn on the authorized original conversation. Paused/interrupted threads, approvals and explicit user stops block automatic continuation. A persistent stop timestamp also protects old replies after later manual turns.
6. `reserved` consumers can recover the same execution ID. Once `started`, recovery inspects that execution only. A known terminal outcome repairs any remaining writer claim; an ambiguous outcome is blocked as `consumer_outcome_unknown`. Neither transport retries nor redrive relaunches the CLI or allocates a replacement consumer.

All existing-conversation root chat commands enter the shared thread admission guard. Existing explicit follow-up/steering behavior stays in its own queue path. The built-in Project general agent currently supports its primary conversation thread; Assistant replies also support registered branches. Unsupported Project branch targets are rejected rather than redirected.

The model notification is host-authored reference text. Executor summaries, logs and artifacts are retrieved through authorized tools as tool data, never copied into user/system instructions. No tokens or closures are persisted in messages.

## Observation and Project projection

`RuntimeObservationMonitorService` leases due Invocation records independently of the parent turn. It observes existing handles and never launches them. `ProjectTaskDispatchRecoveryService` separately replays committed pending dispatch intents with the original call ID and current authorization; ambiguous launches are never repeated.

A persisted startup fence lasts at most 120 seconds. Background inspection does not invalidate intermediate launch receipts while startup is still in progress; cancellation remains available. After the deadline, inspection resumes. A verified preflight failure can be recorded as failed only before any launch receipt exists; ambiguous launches remain unknown and are never replayed.

Automatic projection requires the latest implementation attempt, unchanged specification, and the task revision captured at dispatch or by the preceding projection. The final write also uses revision CAS because some legacy writers do not take the Project lock. Actual runtime start maps to `in_progress`, success to `review`, failure to `blocked`. Cancelling an Invocation does not cancel the Task. Final acceptance and `done` decisions belong to stage 4.

## Operations

Apply `xpert-project/migrations/20261006-project-task-runtime.sql`, then [20261006-runtime-reliable-replies.sql](migrations/20261006-runtime-reliable-replies.sql) before starting the updated host. Both migrations are additive and repeatable. Old attempts without a captured projection revision do not automatically overwrite Task decisions. Historical terminal calls are not automatically awakened; new committed observations create delivery intents.

- `GET /api/agent-invocations/:id/delivery`: owner-scoped delivery and consumption receipts, stable consumer execution ID, attempts and diagnostic codes. Owners with active organization membership can inspect transport failures even when a binding is revoked; this endpoint does not expose executor result bodies or grant runtime access.
- `POST /api/agent-invocations/:id/delivery/redrive`, body `{}`: reauthorize the original reply target and reschedule blocked/failed transport. Retain claims, phases and user-stop barriers. For `consumer_outcome_unknown`, inspect the recorded execution; redrive only checks that same identity. For an explicit user stop, read the result in a manual turn rather than bypassing the stop.
- Pending dispatch errors are on the existing Task Execution (`dispatchError`); a corrected explicit dispatch with the same request ID can recover its pinned intent. Business retries require a new attempt.

Leases permit independent host processes to scan safely. Polling is the durable recovery mechanism; local events and queue delivery are acceleration only. This provides retryable delivery and idempotent consumption, not exactly-once network or model execution.

## Validation

Database tests use real PostgreSQL/TypeORM with isolated schemas and controlled adapters. They cover commit rollback, duplicate receipt, wait/reply races, current-turn claims, thread admission, stop/approval fences, revoked bindings, recovery, projections and migration reapplication. Boundary tests exercise actual Nest HTTP pipes and inherited handler injection. They do not constitute a live Redis, deployed platform, real model or Computer CLI acceptance test.

Run `node tools/scripts/verify-runtime-recovery.mjs` from the repository root for opt-in process/queue recovery acceptance. It creates its own PostgreSQL and Redis containers, binds ephemeral localhost ports, and removes only those containers and their volumes afterwards. No platform credentials or business database are used. Logs and a summary are written to a private temporary directory.

The additional case kills a producer after the Invocation/outbox transaction commits, kills a receiver after the inbox transaction but before Bull acknowledges the job, restarts the dedicated Redis with AOF persistence, and kills a consumer after its execution result commits but before continuation finalization. It waits for the real lease to expire and verifies one original CLI start, one inbox and the same consumer execution ID. The queue gateway, transport, store, inbox and continuation are production implementations; authentication and model execution are controlled test boundaries. Actual CLI/model and Web/Desktop evidence remains in the project-task and execution-view acceptance records.
