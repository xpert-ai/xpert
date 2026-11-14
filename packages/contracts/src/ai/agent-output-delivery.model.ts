import { z } from 'zod/v3'

export const AGENT_OUTPUT_MAX_PATHS = 128

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

/** An export selection is a list of exact files, never a filesystem search. */
const deliveryPathsSchema = z
  .array(
    agentResultPathSchema.refine(
      (path) => !/[*?\[\]{}]/.test(path),
      'Delivery paths must be exact relative file paths, without wildcards. Select paths explicitly when they are known.'
    )
  )
  .min(1)
  .max(AGENT_OUTPUT_MAX_PATHS)
  .optional()
  .describe(
    'Exact file paths relative to the task working directory. No wildcards/globs or directories. If filenames are determined during execution, collect them with delivery recovery once the exact paths are known.'
  )

/** Omission means no file delivery. A report file is optional and independent of artifact export mode. */
export const agentOutputDeliverySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none'), reportPath: agentResultPathSchema.optional() }).strict(),
  z
    .object({ mode: z.literal('files'), paths: deliveryPathsSchema, reportPath: agentResultPathSchema.optional() })
    .strict(),
  z
    .object({ mode: z.literal('archive'), paths: deliveryPathsSchema, reportPath: agentResultPathSchema.optional() })
    .strict()
])
export type AgentOutputDelivery = z.output<typeof agentOutputDeliverySchema>

/** A delivery retry cannot relaunch the executor or change its originally selected report. */
export const agentDeliveryRecoverySchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    paths: deliveryPathsSchema
  })
  .strict()
export type AgentDeliveryRecovery = z.output<typeof agentDeliveryRecoverySchema>
