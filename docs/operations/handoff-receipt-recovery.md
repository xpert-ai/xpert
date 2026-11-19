# Controlled Handoff receipts and recovery (#1413)

The producer and consumer now advertise `handoff/dispatch-receipt-v1`. Admission still requires a fresh matching worker capability, database schema and the v3 physical queue. Apply `core.task-publication-diagnostics` before rolling out the host. Deploy all callback workers before enabling new traffic; verify their advertised contract and v3 queue consumption. Do not enable old v2 consumers to drain historical work without a separate review.

The callback admission stores its worker claim on the Handoff task. The callback's actual return, outcome and task completion are persisted in one transaction. Duplicate deliveries cannot claim the same business execution. A failed receipt write retries the receipt only. If that replica dies before persisting it, execution remains uncertain. Queue completion, root Agent success and an outbound WeChat `sent` row do not substitute for this receipt. `retry` and thrown callback errors remain uncertain; an explicit `dead` result is retained as a failed callback, distinct from success.

## Read-only inventory

Use an authorized platform maintenance context with the verified tenant and business organization. Installation tenant scope is separate from business organization scope. Do not recover credentials from browser storage. This change adds no public administrative endpoint or plugin capability.

For each exact affected Handoff task ID, call `TaskControlStore.inspectHandoff({ tenantId, organizationId }, targetId)`. The result includes revision, task state/outcome, worker states, safe publication diagnostics and an evidence classification; it excludes message content and credentials. Save this report for review alongside the deployed platform revision, relevant callback implementation and worker topology.

| Evidence          | Meaning / permitted next step                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `completed`       | Already settled; inspect outcome and descendants, perform no replay.                                                                                                           |
| `receipt`         | A persisted callback receipt exists. Normal receipt reconciliation may finish the task.                                                                                        |
| `legacy_returned` | That callback has a terminal result, exactly one direct worker with a successful exit, and all descendants completed without claims. Eligible for the per-target repair below. |
| `never_admitted`  | A new-protocol outbox exists, with no worker, result or publication. Retry after resolving its admission diagnostic; never label it delivered.                                 |
| `pending`         | New-protocol work is queued; normal worker processing retains identity and cancellation checks.                                                                                |
| `uncertain`       | Execution started, a claim remains, or receipt evidence is incomplete. Do not replay or complete automatically.                                                                |
| `legacy_review`   | The old publication lacks the new protocol marker. It is quarantined. Absence of a current worker is not proof that an older deployment never ran it.                          |

`worker` and `schema` publication diagnostics are retryable after readiness/migrations recover. `handler`, `protocol`, `scope` and `payload` are blocked until the contract/data problem is reviewed. Diagnostics contain stable codes, never raw exceptions or payloads. Managed Queue transport failures remain recorded on the child outbox. Do not bulk-reset diagnostics to force replay.

## Reviewed per-target repair

After the user approves the concrete inventory, `recoverLegacyHandoffReceipt(scope, targetId, observedRevision)` can repair a `legacy_returned` entry. It rechecks scope, revision, original terminal result, successful worker exit and every descendant under the root lock. It retains the original result, records `receipt_recovered` with a timestamp, increments the task revision, and never dispatches a callback or sends a message. A failed worker, missing result, retry result, active descendant or stale revision cannot authorize this repair. Concurrent repair calls remain idempotent.

After repair, use normal thread finalization and confirm all attached descendants are settled. Do not directly write thread `busy`/`idle`, task completion or tool timestamps. A failed callback result remains failed even when its execution has settled.

Historical publications with neither a callback result nor a trustworthy worker exit require separate evidence acquisition. A prospective replay plan must identify each callback, prove it never executed across every legacy queue/replica, identify external idempotency support, and obtain approval. This change deliberately supplies no blanket queued-to-completed or historical replay operation.

## Legacy compatibility retirement

Track retirement under #1413 and review it during subsequent host releases. Elapsed releases alone do not authorize removal: upgrading code does not remove persisted tasks or results.

| Compatibility code                                                                                           | Required removal evidence                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `legacyTerminalResult`, `legacyHandoffOutcome`, and the `legacy_returned` classification branch              | Legacy producers/workers are retired across all replicas and supported rollback deployments; outstanding legacy tasks are resolved or explicitly archived out of runtime processing; no recovery caller depends on the old result format.                                                                                             |
| `TaskControlStore.recoverLegacyHandoffReceipt()`                                                             | The same task inventory is closed, the historical repair window has ended, and maintenance callers have been retired.                                                                                                                                                                                                                 |
| Raw-result fallback in `HandoffQueueService.enqueueAndWait()` and raw-result encoding in `settleUnstarted()` | All raw-result writers are retired or migrated, including the current pre-dispatch cancellation writer, and no readable retained result requires the fallback after an explicit migration or expiry under the retention policy. A repaired task still retains its raw result, so completing repairs alone does not satisfy this gate. |

The raw-result reader is not exclusively historical: `settleUnstarted()` currently uses it for new cancellations before dispatch. Migrate that writer and reader together while preserving the cancellation result; never fabricate a worker claim or callback-execution receipt for work that did not run.

Record the deployed worker versions, scoped task/result inventory and caller review before removing the compatibility code and its specific tests. Retained archives or backups must not reintroduce legacy records into runtime without a supported migration or rejection path.

Protocol isolation is a permanent safety requirement. Preserve the unsupported-contract publication guard, the missing-`receiptProtocol` classification guard, and the `settleUnstarted()` evidence guard. They may later report a generic unsupported-protocol result, but missing or unsupported metadata must never authorize dispatch, replay or inferred completion. Keep the corresponding isolation tests when deleting legacy readers or repair helpers. Messages without a controlled parent remain a supported path and are outside this retirement scope.

The private revision `7cd415615196349059f56d90ab1dd62c10c31243` was not available for source verification. The reproduced current producer/consumer mismatch does not establish the cause of every historical sample. No production data repair, package publication or deployment is part of this code change.
