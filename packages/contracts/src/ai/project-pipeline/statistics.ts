import {
  pipelineAttemptCountsSchema,
  pipelineExecutionTimingSchema,
  pipelineExecutorStatisticsSchema,
  pipelineAttemptCounts,
  pipelineExecutionTiming,
  pipelineExecutorStatistics,
  type PipelineAttemptFact
} from './execution-statistics'
import { z } from 'zod/v3'
import { pipelineModelUsageStatisticsSchema } from './model-usage-statistics'
import type { ProjectPipelineProjectionNode } from './projection.schema'
import { pipelineNodeNeedsHuman } from './human-wait.schema'
import { projectPipelineNativeModelBudgetStatusSchema } from './budget.schema'

const count = z.number().int().nonnegative()
export const projectPipelineWorkCountsSchema = z
  .object({
    total: count,
    completed: count,
    failed: count,
    cancelled: count,
    running: count,
    blocked: count,
    unknown: count
  })
  .strict()
export const projectPipelineStatisticsSchema = z
  .object({
    scope: z.literal('round'),
    executionScope: z.enum(['round', 'linked_task_history']).optional(),
    work: projectPipelineWorkCountsSchema,
    /** Business nodes include work, human gates and external confirmations; controls are excluded. */
    business: projectPipelineWorkCountsSchema.optional(),
    needsYou: count,
    attempts: pipelineAttemptCountsSchema,
    timing: pipelineExecutionTimingSchema.optional(),
    byExecutor: z.array(pipelineExecutorStatisticsSchema).optional(),
    modelUsage: pipelineModelUsageStatisticsSchema.optional(),
    nativeModelBudget: projectPipelineNativeModelBudgetStatusSchema.optional(),
    byLane: z.array(z.object({ key: z.string().nullable(), work: projectPipelineWorkCountsSchema }).strict()),
    byStage: z.array(z.object({ key: z.string(), work: projectPipelineWorkCountsSchema }).strict())
  })
  .strict()
export type ProjectPipelineStatistics = z.output<typeof projectPipelineStatisticsSchema>
type Node = { projection: ProjectPipelineProjectionNode; taskIds: string[]; executionIds?: string[] }
const isBusinessNode = (kind: ProjectPipelineProjectionNode['kind']) =>
  kind === 'work' || kind === 'human_gate' || kind === 'external_wait'
export function selectedPipelineAttemptFacts(
  nodes: readonly Node[],
  executions: readonly PipelineAttemptFact[],
  historical = false
) {
  const selected = nodes.filter(
    ({ projection: { kind, state } }) =>
      isBusinessNode(kind) && state.applicability === 'selected' && (historical || state.freshness === 'current')
  )
  const legacyTasks = new Set(
    selected.filter((node) => node.executionIds === undefined).flatMap((node) => node.taskIds)
  )
  const executionIds = new Set(selected.flatMap((node) => node.executionIds ?? []))
  const facts = new Map<string, PipelineAttemptFact>()
  for (const execution of executions) {
    if (!executionIds.has(execution.id) && !legacyTasks.has(execution.taskId)) continue
    const identity = execution.agentExecutionId
      ? `native:${execution.agentExecutionId}`
      : execution.invocationId
        ? `invocation:${execution.invocationId}`
        : execution.id
          ? `attempt:${execution.id}`
          : null
    if (identity && !facts.has(identity)) facts.set(identity, execution)
  }
  return [...facts.values()]
}
/** Compute on the server from a complete, authorized MVCC snapshot; never from a filtered page. */
export function projectPipelineStatistics(
  nodes: readonly Node[],
  executions: readonly PipelineAttemptFact[],
  historical = false,
  executionScope: 'round' | 'linked_task_history' = 'linked_task_history'
): ProjectPipelineStatistics {
  const selected = nodes.filter(
    ({ projection: { state } }) => state.applicability === 'selected' && (historical || state.freshness === 'current')
  )
  const work = selected.filter((node) => node.projection.kind === 'work')
  const counts = (items: readonly Node[]) => ({
    total: items.length,
    completed: items.filter((node) => node.projection.state.lifecycle === 'completed').length,
    failed: items.filter((node) => node.projection.state.lifecycle === 'failed').length,
    cancelled: items.filter((node) => node.projection.state.lifecycle === 'cancelled').length,
    running: items.filter((node) => node.projection.state.runtime === 'running').length,
    blocked: items.filter(
      (node) =>
        ['pending', 'active', 'failed'].includes(node.projection.state.lifecycle) &&
        node.projection.state.readiness === 'blocked'
    ).length,
    unknown: items.filter((node) => node.projection.state.runtime === 'unknown').length
  })
  // Execution identity counts once even if the same fact is linked to multiple work items.
  const recorded = selectedPipelineAttemptFacts(nodes, executions, historical)
  const attempts = pipelineAttemptCounts(recorded)
  return {
    scope: 'round',
    executionScope,
    work: counts(work),
    business: counts(selected.filter((node) => isBusinessNode(node.projection.kind))),
    attempts,
    timing: pipelineExecutionTiming(recorded),
    byExecutor: pipelineExecutorStatistics(recorded),
    needsYou: selected.filter((node) => pipelineNodeNeedsHuman(node.projection, historical)).length,
    byLane: [...new Set(work.map((node) => node.projection.laneKey))].map((key) => ({
      key,
      work: counts(work.filter((node) => node.projection.laneKey === key))
    })),
    byStage: [...new Set(work.map((node) => node.projection.stageKey))].map((key) => ({
      key,
      work: counts(work.filter((node) => node.projection.stageKey === key))
    }))
  }
}
