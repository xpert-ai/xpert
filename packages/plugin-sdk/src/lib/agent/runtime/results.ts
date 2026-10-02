import { z } from 'zod/v3'

/** Opt in to the host's authorized, on-demand result View from middleware metadata. */
export const AGENT_TASK_RESULTS_FEATURE = 'agent_task_results'

/** Relative file selections only. A declaration does not grant filesystem access. */
export const agentResultPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !/^[a-zA-Z]:/.test(path) &&
      !path.includes('\\') &&
      !/[\x00-\x1f]/.test(path) &&
      path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Expected a relative file path'
  )

/** Omission means no export. Optional paths restrict the adapter's explicitly declared deliverables. */
export const agentOutputDeliverySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('files'), paths: z.array(agentResultPathSchema).min(1).max(32).optional() }).strict(),
  z.object({ mode: z.literal('archive'), paths: z.array(agentResultPathSchema).min(1).max(32).optional() }).strict()
])
export type AgentOutputDelivery = z.output<typeof agentOutputDeliverySchema>

const common = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  title: z.string().min(1).max(200),
  summary: z.string().max(16000)
}
/** Machine-readable result kind; file declarations are not committed artifacts or download grants. */
export const agentResultItemSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('analysis') }).strict(),
  z
    .object({
      ...common,
      type: z.literal('changes'),
      files: z
        .array(
          z
            .object({
              path: agentResultPathSchema,
              change: z.enum(['created', 'modified', 'deleted'])
            })
            .strict()
        )
        .max(128)
    })
    .strict(),
  z
    .object({
      ...common,
      type: z.literal('tests'),
      status: z.enum(['passed', 'failed', 'skipped']),
      command: z.string().max(2000).optional()
    })
    .strict(),
  z.object({ ...common, type: z.literal('file'), path: agentResultPathSchema }).strict()
])
export type AgentResultItem = z.output<typeof agentResultItemSchema>

/** Explicit final response envelope shared by adapters; ordinary prose is never classified heuristically. */
export const agentTaskResultSchema = z
  .object({ version: z.literal(1), summary: z.string().max(64000), items: z.array(agentResultItemSchema).max(32) })
  .strict()
  .refine(
    (value) => new Set(value.items.map((item) => item.id)).size === value.items.length,
    'Result item IDs must be unique'
  )
export type AgentTaskResult = z.output<typeof agentTaskResultSchema>

/** Persist only after the platform has committed the artifact; never accept an ID invented by a model. */
export interface AgentResultArtifact {
  id: string
  name?: string
  mimeType?: string
  /** Required for downloads; optional only to read older task records without changing their meaning. */
  versionId?: string
  /** Item paths included in this immutable artifact. */
  paths?: string[]
}

export interface AgentArtifactSelection {
  mode: 'files' | 'archive'
  /** Exact relative files; the runner still enforces filesystem and delivery authorization. */
  paths: string[]
}

/** Export outcome is independent of task success, so an export error cannot hide completed work. */
export interface AgentOutputExport {
  mode: AgentOutputDelivery['mode']
  status: 'not_requested' | 'completed' | 'failed' | 'unavailable'
  /** Safe diagnostic only; execution status is independent of export status. */
  error?: string
}
