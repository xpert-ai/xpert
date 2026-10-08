# Agent node execution

Include workflow node execution.

## Audit timestamps

`createdAt` and `updatedAt` are managed by TypeORM. Execution create/update ignores
caller-supplied values for those fields. Finalization must not replay the initial
database row, which can overwrite newer timestamps and usage counters. Runtime
callbacks can still persist their updated metadata and checkpoint fields.

## Completion timestamps

`completedAt` records the wall-clock time when an execution succeeds, fails, times
out or is interrupted. Resuming to running/pending clears it; the next stop records
a new timestamp. Metadata updates and repeated finalization preserve the recorded
end. `elapsedTime` retains its existing execution-duration meaning and is not used
to reconstruct calendar times. `updatedAt` continues to advance on later metadata
changes, so it cannot substitute for the execution's end time.

Apply `migrations/20261008-execution-completed-at.sql` before starting the updated
API against an existing database. The migration is additive and repeatable; it does
not backfill historical rows because their actual end times cannot be recovered
reliably from `updatedAt` or elapsed time. The task timeline leaves those ends unknown.
