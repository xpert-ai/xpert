import { z } from 'zod/v3'
import type { ProjectPipelineProjectionNode } from './projection.schema'

/** This is a host observation, never a claim about when a person started or stopped working. */
export const pipelineHumanWaitSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    observedAt: z.string().datetime(),
    nodeIds: z.array(z.string().uuid()).max(10000)
  })
  .strict()
  .refine((value) => new Set(value.nodeIds).size === value.nodeIds.length, 'PIPELINE_WAIT_DUPLICATE_NODE')
export type PipelineHumanWaitSnapshot = z.output<typeof pipelineHumanWaitSnapshotSchema>

export function pipelineNodeNeedsHuman(node: ProjectPipelineProjectionNode, historical = false) {
  return (
    node.kind === 'human_gate' &&
    node.state.applicability === 'selected' &&
    (historical || node.state.freshness === 'current') &&
    ['pending', 'active'].includes(node.state.lifecycle) &&
    node.state.readiness === 'ready'
  )
}
