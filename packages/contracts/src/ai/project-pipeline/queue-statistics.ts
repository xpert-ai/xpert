import { z } from 'zod/v3'
import { pipelineExecutionTimingSchema } from './execution-statistics'

const count = z.number().int().nonnegative()
const metrics = z
  .object({
    total: count,
    dispatched: count,
    queued: count,
    unavailable: count,
    dispatchWait: pipelineExecutionTimingSchema,
    pendingWait: z
      .object({
        samples: count,
        totalMs: z.number().nonnegative().nullable(),
        oldestMs: z.number().nonnegative().nullable()
      })
      .strict()
  })
  .strict()
export const pipelineQueueStatisticsSchema = z
  .object({
    scope: z.literal('recorded_dispatch_outbox_created_in_window'),
    coverage: z.object({ recorded: count, missingCreatedAt: count, outsideWindow: count }).strict(),
    total: metrics,
    bySource: z.array(z.object({ source: z.enum(['managed_operation', 'provider_action']), metrics }).strict())
  })
  .strict()
export type PipelineQueueStatistics = z.output<typeof pipelineQueueStatisticsSchema>
export interface PipelineQueueFact {
  id: string
  source: 'managed_operation' | 'provider_action'
  createdAt: string | null
  dispatchStartedAt: string | null
  waiting: boolean
}

/** Outbox admission to first dispatch, not Agent runtime or human approval time.
 * Unknown/closed records without a dispatch timestamp are not zero-duration waits. */
export function pipelineQueueStatistics(
  facts: readonly PipelineQueueFact[],
  window: { from: string; to: string },
  snapshotAt: string
): PipelineQueueStatistics {
  const recorded = [...new Map(facts.map((fact) => [`${fact.source}:${fact.id}`, fact])).values()]
  const from = Date.parse(window.from),
    to = Date.parse(window.to),
    now = Date.parse(snapshotAt)
  const selected: PipelineQueueFact[] = []
  let missingCreatedAt = 0,
    outsideWindow = 0
  for (const fact of recorded) {
    const start = fact.createdAt ? Date.parse(fact.createdAt) : NaN
    if (!Number.isFinite(start)) missingCreatedAt++
    else if (start < from || start >= to) outsideWindow++
    else selected.push(fact)
  }
  const aggregate = (rows: PipelineQueueFact[]) => {
    const completed: number[] = [],
      pending: number[] = []
    for (const row of rows) {
      const start = Date.parse(row.createdAt!),
        end = row.dispatchStartedAt ? Date.parse(row.dispatchStartedAt) : NaN
      if (row.dispatchStartedAt && Number.isFinite(end) && end >= start && end <= now) completed.push(end - start)
      else if (!row.dispatchStartedAt && row.waiting && start <= now) pending.push(now - start)
    }
    completed.sort((a, b) => a - b)
    const totalMs = completed.length ? completed.reduce((sum, value) => sum + value, 0) : null
    return {
      total: rows.length,
      dispatched: completed.length,
      queued: pending.length,
      unavailable: rows.length - completed.length - pending.length,
      dispatchWait: {
        samples: completed.length,
        unavailable: rows.length - completed.length,
        totalMs,
        meanMs: totalMs === null ? null : totalMs / completed.length,
        medianMs: completed.length
          ? (completed[Math.floor((completed.length - 1) / 2)] + completed[Math.floor(completed.length / 2)]) / 2
          : null,
        p95Ms: completed.length ? completed[Math.ceil(completed.length * 0.95) - 1] : null
      },
      pendingWait: {
        samples: pending.length,
        totalMs: pending.length ? pending.reduce((sum, value) => sum + value, 0) : null,
        oldestMs: pending.length ? pending.reduce((maximum, value) => Math.max(maximum, value), 0) : null
      }
    }
  }
  const sources = ['managed_operation', 'provider_action'] as const
  return {
    scope: 'recorded_dispatch_outbox_created_in_window',
    coverage: { recorded: recorded.length, missingCreatedAt, outsideWindow },
    total: aggregate(selected),
    bySource: sources.map((source) => ({ source, metrics: aggregate(selected.filter((row) => row.source === source)) }))
  }
}
