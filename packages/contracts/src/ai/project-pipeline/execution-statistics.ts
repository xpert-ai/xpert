import { z } from 'zod/v3'

const count = z.number().int().nonnegative()
export const pipelineAttemptCountsSchema = z
  .object({
    total: count,
    queued: count,
    running: count,
    waiting: count.optional(),
    succeeded: count,
    failed: count,
    cancelled: count,
    unknown: count,
    terminal: count,
    successRate: z.number().min(0).max(1).nullable(),
    retries: count,
    additionalAttempts: count.optional(),
    unclassifiedAttempts: count.optional()
  })
  .strict()
export const pipelineExecutionTimingSchema = z
  .object({
    samples: count,
    unavailable: count,
    totalMs: z.number().nonnegative().nullable(),
    meanMs: z.number().nonnegative().nullable(),
    medianMs: z.number().nonnegative().nullable(),
    p95Ms: z.number().nonnegative().nullable()
  })
  .strict()
export const pipelineExecutorStatisticsSchema = z
  .object({
    xpertId: z.string().nullable(),
    agentKey: z.string().nullable(),
    provider: z.string().nullable(),
    toolId: z.string().nullable(),
    serviceRef: z.string().nullable().optional(),
    attempts: pipelineAttemptCountsSchema,
    timing: pipelineExecutionTimingSchema
  })
  .strict()

export type PipelineAttemptFact = {
  id?: string
  taskId: string
  agentExecutionId?: string | null
  invocationId?: string | null
  xpertId?: string | null
  agentKey?: string | null
  runtimeProvider?: string
  runtimeToolId?: string
  runtimeServiceRef?: string
  pipelineAttemptKind?: 'initial' | 'technical_retry'
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  runtimeStatus?: string
  invocationStatus?: string
  runtimeStartedAt?: string | null
  runtimeCompletedAt?: string | null
}

/** Full Invocation outcomes preserve waiting/unknown states lost by the legacy Task status.
 * Runtime observation takes precedence over business acceptance; absence retains the legacy fallback.
 */
function status(
  fact: PipelineAttemptFact
): 'queued' | 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled' | 'unknown' {
  const observed = fact.invocationStatus ?? fact.runtimeStatus
  if (!observed) return fact.status
  switch (observed) {
    case 'success':
    case 'succeeded':
      return 'succeeded'
    case 'error':
    case 'failed':
    case 'timeout':
      return 'failed'
    case 'running':
      return 'running'
    case 'pending':
    case 'queued':
      return 'queued'
    case 'interrupted':
    case 'waiting':
      return 'waiting'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export function pipelineAttemptCounts(facts: readonly PipelineAttemptFact[]) {
  const result = {
    total: facts.length,
    queued: 0,
    running: 0,
    waiting: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    unknown: 0,
    terminal: 0,
    successRate: null as number | null,
    retries: 0,
    additionalAttempts: 0,
    unclassifiedAttempts: 0
  }
  const perTask = new Map<string, number>()
  for (const fact of facts) {
    result[status(fact)]++
    if (fact.pipelineAttemptKind === 'technical_retry') result.retries++
    else if (!fact.pipelineAttemptKind) result.unclassifiedAttempts++
    perTask.set(fact.taskId, (perTask.get(fact.taskId) ?? 0) + 1)
  }
  result.terminal = result.succeeded + result.failed + result.cancelled
  result.successRate = result.terminal ? result.succeeded / result.terminal : null
  result.additionalAttempts = [...perTask.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0)
  return result
}

/** Only recorded, terminal runtime intervals contribute. Missing times are not zero-duration runs. */
export function pipelineExecutionTiming(facts: readonly PipelineAttemptFact[]) {
  const intervals = facts
    .flatMap((fact) => {
      if (
        !['succeeded', 'failed', 'cancelled'].includes(status(fact)) ||
        !fact.runtimeStartedAt ||
        !fact.runtimeCompletedAt
      )
        return []
      const start = Date.parse(fact.runtimeStartedAt),
        end = Date.parse(fact.runtimeCompletedAt)
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? [end - start] : []
    })
    .sort((a, b) => a - b)
  const totalMs = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) : null
  return {
    samples: intervals.length,
    unavailable: facts.length - intervals.length,
    totalMs,
    meanMs: totalMs === null ? null : totalMs / intervals.length,
    medianMs: intervals.length
      ? (intervals[Math.floor((intervals.length - 1) / 2)] + intervals[Math.floor(intervals.length / 2)]) / 2
      : null,
    p95Ms: intervals.length ? intervals[Math.ceil(intervals.length * 0.95) - 1] : null
  }
}

export function pipelineExecutorStatistics(facts: readonly PipelineAttemptFact[]) {
  const groups = new Map<
    string,
    {
      identity: {
        xpertId: string | null
        agentKey: string | null
        provider: string | null
        toolId: string | null
        serviceRef: string | null
      }
      facts: PipelineAttemptFact[]
    }
  >()
  for (const fact of facts) {
    const identity = {
      xpertId: fact.xpertId ?? null,
      agentKey: fact.agentKey ?? null,
      provider: fact.runtimeProvider ?? null,
      toolId: fact.runtimeToolId ?? null,
      serviceRef: fact.runtimeServiceRef ?? null
    }
    const key = JSON.stringify(identity),
      group = groups.get(key) ?? { identity, facts: [] }
    group.facts.push(fact)
    groups.set(key, group)
  }
  return [...groups.values()].map(({ identity, facts }) => ({
    ...identity,
    attempts: pipelineAttemptCounts(facts),
    timing: pipelineExecutionTiming(facts)
  }))
}
