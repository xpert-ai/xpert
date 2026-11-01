import { z } from 'zod/v3'

/** Runtime-owned activity semantics. Display names and model prose are never classifiers. */
export const trailActivityKindSchema = z.enum(['task', 'explore', 'change', 'verify', 'answer', 'other'])
export type TrailActivityKind = z.infer<typeof trailActivityKindSchema>
export const trailStatusSchema = z.enum([
  'running',
  'success',
  'error',
  'pending',
  'waiting',
  'cancelling',
  'idle',
  'interrupted',
  'unknown'
])
export type TrailStatus = z.infer<typeof trailStatusSchema>
const anchor = {
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  executionId: z.string().optional()
}
export const trailStepSchema = z.object({
  id: z.string(),
  laneId: z.string(),
  kind: z.enum(['turn', 'tool', 'message']),
  activity: trailActivityKindSchema,
  title: z.string(),
  status: trailStatusSchema,
  order: z.number().int().nonnegative(),
  ...anchor,
  toolCallId: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  preview: z.string().optional(),
  answer: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional()
})
export const trailLaneSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  spawnStepId: z.string().optional(),
  title: z.string(),
  primary: z.boolean(),
  status: trailStatusSchema,
  ...anchor,
  invocationKind: z.enum(['sub_agent', 'external_assistant', 'activity']).optional(),
  purpose: z.enum(['side-chat', 'message-edit']).optional(),
  elapsedMs: z.number().nonnegative().optional(),
  outcome: z.object({ status: z.string(), accepted: z.boolean(), message: z.string().optional() }).optional()
})
export const trailEpisodeSchema = z.object({
  id: z.string(),
  laneId: z.string(),
  activity: trailActivityKindSchema,
  stepIds: z.array(z.string())
})
export const trailGraphSchema = z.object({
  version: z.literal(1),
  layer: z.enum(['conversation', 'execution']),
  conversationId: z.string(),
  threadId: z.string(),
  messageId: z.string().optional(),
  title: z.string(),
  lanes: z.array(trailLaneSchema).max(500),
  steps: z.array(trailStepSchema).max(5000),
  episodes: z.array(trailEpisodeSchema),
  coverage: z.array(
    z.enum([
      'record_limit',
      'missing_identity',
      'no_execution',
      'timing_unavailable',
      'activity_unavailable',
      'historical'
    ])
  ),
  source: z.object({ conversationId: z.string(), threadId: z.string(), messageId: z.string() }).optional(),
  live: z.boolean()
})
export type TrailStep = z.infer<typeof trailStepSchema>
export type TrailLane = z.infer<typeof trailLaneSchema>
export type TrailEpisode = z.infer<typeof trailEpisodeSchema>
export type TrailGraph = z.infer<typeof trailGraphSchema>
