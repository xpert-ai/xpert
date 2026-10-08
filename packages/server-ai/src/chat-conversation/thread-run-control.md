# Durable pause and stop

`POST /api/ai/threads/:threadId/runs/:runId/pause` is a control command with no request body. After contribution authorization and a row lock, it returns HTTP 202 with the execution ID, state and pause ID. Repeated requests for the same active pause return the same token; an old execution cannot pause a replacement run. Legacy request bodies are ignored. Request acceptance means `pausing`, not checkpoint completion.

The server owns execution checkpoints and message persistence. ChatKit keeps displaying live output while the current step finishes. Node admission guards prevent the next step from starting. Only finalization, after checkpoint and message persistence, confirms `paused`. If the workflow finishes naturally first, it becomes idle. A pause does not undo completed operations or interrupt an in-flight external action midway.

ChatKit polls normal thread status during busy/pausing and restores messages from the normal paginated history API. It does not serialize, freeze, upload, or restore a UI transcript. Deprecated SDK display metadata and the release endpoint exist only for compatibility. Thread DTOs never return historical snapshots. Resume still validates the saved pause ID, graph revision and checkpoint, restores encrypted runtime context, and creates a new execution attempt.

Stop is a separate action available while running, pausing or paused, including after reconnect with no local SSE connection. It uses the authorized SDK cancel endpoint and surfaces failures for retry. Existing cancellation propagation reaches registered child execution scopes and invalidates queued continuation claims. Separately submitted domain tasks may finish externally; stopping a conversation is not a rollback of those actions. Automatic continuation cannot claim a paused/pausing thread.

## Process loss

New runs and resume claims carry a private process lease in thread metadata. The owner renews it every 15 seconds with a 90-second lifetime. Each renewal and recovery rechecks execution identity under the thread row lock. Public thread DTOs omit lease metadata. A replacement process reconciles expired owners, marks unfinalized runs as errors, interrupts their execution/message status and invalidates delayed invocation continuations in one transaction. It does not replay tools or manufacture a confirmed pause from a staged checkpoint. Confirmed pauses have no active lease and remain resumable. Old runs without a lease are not guessed dead from elapsed time; they can be stopped explicitly.

## Rollout and checks

Deploy ChatKit and the SDK change first: bodyless pause is compatible with the prior API. Then deploy the API cleanup and ownership reconciliation. The ChatKit workspace carries a patch for its installed SDK version while the SDK source change is released independently. Do not replace that dependency with an older SDK build.

Focused tests cover actual HTTP requests (including a legacy 2.8 MB body), authorization, idempotency, stale runs, long tools, parallel/nested checkpoints, HITL, stop propagation, reconnect/resume, and background continuation admission. `thread-run-control.integration.spec.ts` additionally tests concurrent row locks, ownership renewal/recovery and message/continuation updates against PostgreSQL in an isolated schema; set `XPERT_PAUSE_TEST_DATABASE_URL` to a disposable database ending in `_test`.
