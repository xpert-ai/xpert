import { z } from 'zod/v3'
import {
  pipelineAttemptCounts,
  pipelineAttemptCountsSchema,
  pipelineExecutionTiming,
  pipelineExecutionTimingSchema,
  pipelineExecutorStatistics,
  pipelineExecutorStatisticsSchema,
  type PipelineAttemptFact
} from './execution-statistics'
import { projectPipelineStatistics, projectPipelineWorkCountsSchema } from './statistics'
import { pipelineModelUsageStatisticsSchema } from './model-usage-statistics'
import { pipelineQueueStatisticsSchema } from './queue-statistics'
import { pipelineHumanWaitStatisticsSchema } from './human-wait-statistics'
import type { ProjectPipelineProjectionNode } from './projection.schema'

export const projectPipelineAnalyticsInputSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true })
  })
  .strict()
  .superRefine((value, context) => {
    const duration = Date.parse(value.to) - Date.parse(value.from)
    if (duration <= 0 || duration > 93 * 86400_000)
      context.addIssue({ code: 'custom', message: 'PIPELINE_ANALYTICS_WINDOW_INVALID' })
  })
export type ProjectPipelineAnalyticsInput = z.output<typeof projectPipelineAnalyticsInputSchema>
const count = z.number().int().nonnegative()
const currentSchema = z
  .object({ work: projectPipelineWorkCountsSchema, business: projectPipelineWorkCountsSchema, needsYou: count })
  .strict()
const executionSchema = z
  .object({ attempts: pipelineAttemptCountsSchema, timing: pipelineExecutionTimingSchema })
  .strict()
export const projectPipelineAnalyticsSchema = z
  .object({
    projectId: z.string().uuid(),
    snapshotAt: z.string().datetime(),
    businessScope: z.literal('current_rounds'),
    executionScope: z.literal('recorded_history_started_in_window'),
    window: projectPipelineAnalyticsInputSchema,
    current: currentSchema,
    executions: executionSchema,
    coverage: z
      .object({
        instances: count,
        instancesWithoutCurrentRound: count,
        recordedAttempts: count,
        attemptsWithoutStartTime: count,
        attemptsOutsideWindow: count,
        sharedAcrossInstances: count
      })
      .strict(),
    byInstance: z.array(
      z
        .object({
          id: z.string().uuid(),
          title: z.string(),
          templateKey: z.string(),
          templateVersion: z.string(),
          authority: z.enum(['provider', 'platform']),
          runState: z.string(),
          current: currentSchema,
          executions: executionSchema
        })
        .strict()
    ),
    byExecutor: z.array(pipelineExecutorStatisticsSchema),
    modelUsage: pipelineModelUsageStatisticsSchema.optional(),
    queue: pipelineQueueStatisticsSchema.optional(),
    humanWait: pipelineHumanWaitStatisticsSchema.optional()
  })
  .strict()
export type ProjectPipelineAnalytics = z.output<typeof projectPipelineAnalyticsSchema>
type Node = { projection: ProjectPipelineProjectionNode; taskIds: string[]; executionIds?: string[] }
export interface PipelineAnalyticsInstanceFacts {
  id: string
  title: string
  templateKey: string
  templateVersion: string
  authority: 'provider' | 'platform'
  runState: string
  currentNodes: Node[]
  historyNodes: Node[]
}

/** Historical execution membership is independent of current path selection or business acceptance. */
export function pipelineAnalyticsFacts(
  instances: readonly PipelineAnalyticsInstanceFacts[],
  executions: readonly PipelineAttemptFact[],
  window: ProjectPipelineAnalyticsInput
) {
  // Explicit ownership is authoritative; omitted IDs retain the legacy helper contract.
  const nodes = instances
    .flatMap((instance) => instance.historyNodes)
    .filter((node) => ['work', 'human_gate', 'external_wait'].includes(node.projection.kind))
  const taskIds = new Set(nodes.filter((node) => node.executionIds === undefined).flatMap((node) => node.taskIds))
  const executionIds = new Set(nodes.flatMap((node) => node.executionIds ?? []))
  const recorded = new Map<string, PipelineAttemptFact>()
  for (const execution of executions) {
    if (!taskIds.has(execution.taskId) && !(execution.id && executionIds.has(execution.id))) continue
    const key = execution.agentExecutionId
      ? `native:${execution.agentExecutionId}`
      : execution.invocationId
        ? `invocation:${execution.invocationId}`
        : execution.id
          ? `attempt:${execution.id}`
          : null
    if (key && !recorded.has(key)) recorded.set(key, execution)
  }
  const from = Date.parse(window.from),
    to = Date.parse(window.to),
    selected: PipelineAttemptFact[] = []
  let attemptsWithoutStartTime = 0,
    attemptsOutsideWindow = 0
  for (const fact of recorded.values()) {
    const startedAt = fact.runtimeStartedAt ? Date.parse(fact.runtimeStartedAt) : NaN
    if (!Number.isFinite(startedAt)) attemptsWithoutStartTime++
    else if (startedAt < from || startedAt >= to) attemptsOutsideWindow++
    else selected.push(fact)
  }
  return { selected, recordedAttempts: recorded.size, attemptsWithoutStartTime, attemptsOutsideWindow }
}

/** One complete authorized snapshot, with a start-time cohort separate from current business state. */
export function projectPipelineAnalytics(
  projectId: string,
  instances: readonly PipelineAnalyticsInstanceFacts[],
  executions: readonly PipelineAttemptFact[],
  window: ProjectPipelineAnalyticsInput,
  snapshotAt: string,
  instancesWithoutCurrentRound = 0
): ProjectPipelineAnalytics {
  return {
    projectId,
    ...aggregatePipelineAnalytics(instances, executions, window, snapshotAt, instancesWithoutCurrentRound)
  }
}

/** Aggregate only authorized raw facts, never sums of per-Project percentages or percentiles. */
export function aggregatePipelineAnalytics(
  instances: readonly PipelineAnalyticsInstanceFacts[],
  executions: readonly PipelineAttemptFact[],
  window: ProjectPipelineAnalyticsInput,
  snapshotAt: string,
  instancesWithoutCurrentRound = 0
): Omit<ProjectPipelineAnalytics, 'projectId'> {
  const current = (nodes: readonly Node[]) => {
    const statistics = projectPipelineStatistics(nodes, [])
    return { work: statistics.work, business: statistics.business!, needsYou: statistics.needsYou }
  }
  const metrics = (facts: readonly PipelineAttemptFact[]) => ({
    attempts: pipelineAttemptCounts(facts),
    timing: pipelineExecutionTiming(facts)
  })
  const facts = pipelineAnalyticsFacts(instances, executions, window)
  const byInstance = instances.map((instance) => ({
    id: instance.id,
    title: instance.title,
    templateKey: instance.templateKey,
    templateVersion: instance.templateVersion,
    authority: instance.authority,
    runState: instance.runState,
    current: current(instance.currentNodes),
    executions: metrics(pipelineAnalyticsFacts([instance], executions, window).selected)
  }))
  return {
    snapshotAt,
    businessScope: 'current_rounds',
    executionScope: 'recorded_history_started_in_window',
    window,
    current: current(instances.flatMap((instance) => instance.currentNodes)),
    executions: metrics(facts.selected),
    coverage: {
      instances: instances.length,
      instancesWithoutCurrentRound,
      recordedAttempts: facts.recordedAttempts,
      attemptsWithoutStartTime: facts.attemptsWithoutStartTime,
      attemptsOutsideWindow: facts.attemptsOutsideWindow,
      sharedAcrossInstances:
        byInstance.reduce((sum, item) => sum + item.executions.attempts.total, 0) - facts.selected.length
    },
    byInstance,
    byExecutor: pipelineExecutorStatistics(facts.selected)
  }
}
