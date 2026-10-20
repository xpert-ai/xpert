import { z } from 'zod/v3'
import { projectPipelineDefinitionSchema } from './definition.schema'
import { projectPipelineKeySchema } from './primitives.schema'
import {
  projectPipelineEvidenceRefSchema,
  projectPipelineNodeStateSchema,
  projectPipelineSubjectVersionSchema
} from './runtime.schema'

const key = z.string().min(1).max(500)
const timestamp = z.string().datetime({ offset: true })
export const projectPipelineTaskProjectionSchema = z
  .object({
    key,
    title: z.string().min(1).max(1000),
    status: z.enum(['todo', 'in_progress', 'review', 'paused', 'done', 'blocked', 'cancelled']),
    progress: z.number().min(0).max(100).nullable().optional(),
    kind: z.enum(['task', 'summary', 'milestone']),
    taskType: z.string().min(1).nullable().optional(),
    parentKey: key.optional(),
    predecessorKeys: z.array(key).max(500),
    diagnostic: z.string().max(4000).optional(),
    assigneeXpertId: z.string().uuid().optional(),
    executions: z
      .array(
        z
          .object({
            key,
            attempt: z.number().int().positive(),
            invocationId: z.string().uuid().optional(),
            agentExecutionId: z.string().uuid().optional(),
            conversationId: z.string().uuid().optional(),
            threadId: z.string().min(1).optional(),
            xpertId: z.string().uuid().optional(),
            agentKey: key.optional(),
            status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
            startedAt: timestamp.optional(),
            completedAt: timestamp.optional(),
            error: z.string().max(4000).optional(),
            outputSummary: z.string().max(4000).optional()
          })
          .strict()
      )
      .max(1000)
  })
  .strict()

/** Display facts supplied by a provider; never authorization or executable instructions. */
const presentationField = z.object({ label: z.string().min(1).max(200), value: z.string().max(4000) }).strict()
export const projectPipelineNodePresentationSchema = z
  .object({
    description: z.string().max(4000).optional(),
    blockers: z.array(z.string().min(1).max(1000)).max(100).optional(),
    nextActionable: z.boolean().optional(),
    operationUnavailableReason: z.string().max(1000).optional(),
    roleDetails: z.array(presentationField).max(30).optional(),
    technicalDetails: z.array(presentationField).max(30).optional(),
    decision: z
      .object({
        outcome: projectPipelineKeySchema,
        label: z.string().max(240),
        reason: z.string().max(4000),
        decidedAt: timestamp.optional(),
        version: z.string().max(500)
      })
      .strict()
      .optional()
  })
  .strict()

export const projectPipelineProjectionNodeSchema = z
  .object({
    key,
    nodeKey: projectPipelineKeySchema,
    expansionKey: key,
    title: z.string().min(1).max(1000),
    kind: z.enum(['work', 'fork', 'join', 'router', 'human_gate', 'external_wait', 'terminal']),
    laneKey: projectPipelineKeySchema.nullable(),
    stageKey: projectPipelineKeySchema,
    state: projectPipelineNodeStateSchema,
    /** A registered Project type resolves the destination again when opened. No URL or business parameters. */
    navigation: z
      .object({ kind: z.literal('project_application') })
      .strict()
      .optional(),
    presentation: projectPipelineNodePresentationSchema.optional(),
    taskKeys: z.array(key).max(100),
    evidence: z.array(projectPipelineEvidenceRefSchema).max(100)
  })
  .strict()
export const projectPipelineProjectionEdgeSchema = z
  .object({
    key,
    from: key,
    to: key,
    outcome: projectPipelineKeySchema.optional(),
    selection: z.enum(['undetermined', 'selected', 'excluded']),
    label: z.string().max(240).optional()
  })
  .strict()
const tombstone = z.object({ key, reason: z.enum(['removed', 'excluded', 'superseded']) }).strict()

/** A complete snapshot covers ONE instance/round. Absence is never a cancellation instruction. */
export const projectPipelineProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceKey: key,
    sourceEpoch: z.string().uuid(),
    sourceSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    title: z.string().min(1).max(1000),
    definition: projectPipelineDefinitionSchema,
    subject: z.object({ resolverRef: z.string().min(1), objectKey: key }).strict(),
    run: z
      .object({
        key,
        state: z.enum(['pending', 'active', 'waiting', 'cancelling', 'completed', 'failed', 'cancelled', 'superseded'])
      })
      .strict(),
    round: z
      .object({
        key,
        sequence: z.number().int().positive(),
        generation: z.number().int().positive(),
        supersedesKey: key.optional(),
        state: z.enum(['active', 'completed', 'awaiting_new_subject', 'failed', 'cancelled', 'superseded']),
        inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
        subjectVersionSet: z.array(projectPipelineSubjectVersionSchema).min(1).max(100)
      })
      .strict(),
    nodes: z.array(projectPipelineProjectionNodeSchema).max(2000),
    edges: z.array(projectPipelineProjectionEdgeSchema).max(8000),
    tasks: z.array(projectPipelineTaskProjectionSchema).max(2000),
    taskTombstones: z.array(tombstone).max(2000),
    nodeTombstones: z.array(tombstone).max(2000)
  })
  .strict()
  .superRefine((snapshot, context) => {
    const issue = (message: string, path: Array<string | number>) => context.addIssue({ code: 'custom', message, path })
    if (snapshot.definition.executionAuthority !== 'provider') issue('PROJECTION_AUTHORITY_REQUIRED', ['definition'])
    if (snapshot.subject.resolverRef !== snapshot.definition.subjectResolverRef)
      issue('SUBJECT_RESOLVER_MISMATCH', ['subject'])
    for (const field of ['nodes', 'edges', 'tasks', 'taskTombstones', 'nodeTombstones'] as const) {
      const keys = snapshot[field].map((item) => item.key)
      if (new Set(keys).size !== keys.length) issue('DUPLICATE_KEY', [field])
    }
    const nodeKeys = new Set(snapshot.nodes.map((node) => node.key))
    const taskKeys = new Set(snapshot.tasks.map((task) => task.key))
    for (const field of ['taskTombstones', 'nodeTombstones'] as const) {
      const active = field === 'taskTombstones' ? taskKeys : nodeKeys
      if (snapshot[field].some((item) => active.has(item.key))) issue('ACTIVE_TOMBSTONE_CONFLICT', [field])
    }
    const lanes = new Set(snapshot.definition.lanes.map((lane) => lane.key))
    const stages = new Set(snapshot.definition.stages.map((stage) => stage.key))
    const identities = snapshot.nodes.map((node) => JSON.stringify([node.nodeKey, node.expansionKey]))
    if (new Set(identities).size !== identities.length) issue('DUPLICATE_NODE_IDENTITY', ['nodes'])
    snapshot.nodes.forEach((node, i) => {
      if (!stages.has(node.stageKey) || (node.laneKey !== null && !lanes.has(node.laneKey)))
        issue('NODE_LAYOUT_REFERENCE_INVALID', ['nodes', i])
      if (['work', 'human_gate', 'external_wait'].includes(node.kind) && node.laneKey === null)
        issue('NODE_LANE_REQUIRED', ['nodes', i])
      if (node.taskKeys.some((key) => !taskKeys.has(key))) issue('NODE_TASK_NOT_FOUND', ['nodes', i, 'taskKeys'])
    })
    snapshot.edges.forEach((edge, i) => {
      if (!nodeKeys.has(edge.from) || !nodeKeys.has(edge.to)) issue('EDGE_NODE_NOT_FOUND', ['edges', i])
    })
    const degree = new Map(snapshot.nodes.map((node) => [node.key, 0]))
    snapshot.edges.forEach((edge) => degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1))
    const queue = [...degree].filter(([, n]) => n === 0).map(([key]) => key)
    let visited = 0
    while (queue.length) {
      const key = queue.shift()!
      visited++
      for (const edge of snapshot.edges.filter((edge) => edge.from === key)) {
        const n = degree.get(edge.to)! - 1
        degree.set(edge.to, n)
        if (n === 0) queue.push(edge.to)
      }
    }
    if (visited !== snapshot.nodes.length) issue('CYCLE', ['edges'])
  })

export type ProjectPipelineProjection = z.output<typeof projectPipelineProjectionSchema>
export type ProjectPipelineProjectionNode = z.output<typeof projectPipelineProjectionNodeSchema>
export type ProjectPipelineProjectionEdge = z.output<typeof projectPipelineProjectionEdgeSchema>

export type ProjectPipelineNodePresentation = z.output<typeof projectPipelineNodePresentationSchema>
