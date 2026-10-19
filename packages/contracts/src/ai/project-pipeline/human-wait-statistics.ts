import { z } from 'zod/v3'
import type { PipelineHumanWaitSnapshot } from './human-wait.schema'

const count = z.number().int().nonnegative()
export const pipelineHumanWaitStatisticsSchema = z
  .object({
    scope: z.literal('observed_human_ready_intervals_intersecting_window'),
    intervals: count,
    ongoing: count,
    censored: count,
    observedNodeMs: z.number().nonnegative().nullable(),
    observedUnionMs: z.number().nonnegative().nullable(),
    coverage: z
      .object({
        snapshots: count,
        missingEvents: count,
        invalidEvents: count,
        currentUntrackedNodes: count,
        observedWindowMs: z.number().nonnegative()
      })
      .strict()
  })
  .strict()
export type PipelineHumanWaitStatistics = z.output<typeof pipelineHumanWaitStatisticsSchema>
export interface PipelineHumanWaitEvent {
  instanceId: string
  revision: number
  snapshot: PipelineHumanWaitSnapshot | null
  invalid?: boolean
}
type Interval = { start: number; end: number; ongoing: boolean; censored: boolean }
function unionDuration(ranges: ReadonlyArray<readonly [number, number]>) {
  let duration = 0,
    until = -Infinity
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    duration += Math.max(0, end - Math.max(start, until))
    until = Math.max(until, end)
  }
  return duration
}

/** Reconstruct only observed ready intervals. A missing event breaks continuity;
 * an initial ready snapshot supplies a lower bound, never a fabricated historical start. */
export function pipelineHumanWaitStatistics(
  events: readonly PipelineHumanWaitEvent[],
  currentWaitingNodeIds: readonly string[],
  window: { from: string; to: string },
  snapshotAt: string
): PipelineHumanWaitStatistics {
  const now = Date.parse(snapshotAt),
    from = Date.parse(window.from),
    to = Math.min(now, Date.parse(window.to))
  const intervals: Interval[] = [],
    tracked = new Set<string>()
  const covered: Array<readonly [number, number]> = []
  const currentWaiting = new Set(currentWaitingNodeIds)
  const groups = new Map<string, PipelineHumanWaitEvent[]>()
  for (const event of events) {
    const group = groups.get(event.instanceId) ?? []
    group.push(event)
    groups.set(event.instanceId, group)
  }
  let snapshots = 0,
    missingEvents = 0,
    invalidEvents = 0
  for (const group of groups.values()) {
    const open = new Map<string, { start: number; censored: boolean }>()
    let lastAt: number | null = null,
      previousRevision: number | null = null,
      continuous = false
    const breakContinuity = () => {
      for (const value of open.values()) intervals.push({ ...value, end: lastAt!, ongoing: false, censored: true })
      open.clear()
      continuous = false
    }
    for (const event of [...group].sort((a, b) => a.revision - b.revision)) {
      if (previousRevision !== null && event.revision !== previousRevision + 1) {
        breakContinuity()
        invalidEvents++
      }
      previousRevision = event.revision
      const observation = event.snapshot
      const at = observation ? Date.parse(observation.observedAt) : NaN
      if (!observation || !Number.isFinite(at) || at > now || (lastAt !== null && at < lastAt)) {
        if (event.invalid || observation) invalidEvents++
        else missingEvents++
        breakContinuity()
        continue
      }
      snapshots++
      if (continuous && lastAt !== null) covered.push([lastAt, at])
      const ready = new Set(observation.nodeIds)
      for (const [id, value] of open)
        if (!ready.has(id)) {
          intervals.push({ ...value, end: at, ongoing: false })
          open.delete(id)
        }
      for (const id of ready) if (!open.has(id)) open.set(id, { start: at, censored: !continuous })
      lastAt = at
      continuous = true
    }
    let currentMatches = true
    for (const [id, value] of open) {
      // Current state is independently read from the same MVCC snapshot. Divergence must not extend an interval.
      if (currentWaiting.has(id)) {
        intervals.push({ ...value, end: now, ongoing: true })
        tracked.add(id)
      } else {
        intervals.push({ ...value, end: lastAt!, ongoing: false, censored: true })
        currentMatches = false
      }
    }
    if (continuous && currentMatches && lastAt !== null) covered.push([lastAt, now])
  }
  const selected = intervals
    .filter((interval) => interval.start < to && interval.end >= from && interval.end >= interval.start)
    .map((interval) => ({ ...interval, start: Math.max(from, interval.start), end: Math.min(to, interval.end) }))
  const ranges = selected.map((interval) => [interval.start, interval.end] as const)
  const observedWindowMs = unionDuration(
    covered
      .filter(([start, end]) => start < to && end > from)
      .map(([start, end]) => [Math.max(start, from), Math.min(end, to)] as const)
  )
  return {
    scope: 'observed_human_ready_intervals_intersecting_window',
    intervals: selected.length,
    ongoing: selected.filter((interval) => interval.ongoing).length,
    censored: selected.filter((interval) => interval.censored).length,
    observedNodeMs: observedWindowMs
      ? selected.reduce((sum, interval) => sum + interval.end - interval.start, 0)
      : null,
    observedUnionMs: observedWindowMs ? unionDuration(ranges) : null,
    coverage: {
      snapshots,
      missingEvents,
      invalidEvents,
      observedWindowMs,
      currentUntrackedNodes: [...currentWaiting].filter((id) => !tracked.has(id)).length
    }
  }
}
