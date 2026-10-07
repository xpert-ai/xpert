import { z } from 'zod/v3'

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
      "Delivery paths must be exact relative file paths, without wildcards. Omit paths to use the executor's declared deliverables."
    )
  )
  .min(1)
  .max(32)
  .optional()
  .describe(
    'Exact file paths relative to the task working directory. No wildcards/globs or directories. If filenames are determined during execution, omit paths and require the executor to declare each deliverable as a file result item.'
  )

/** Omission means no export. Optional paths restrict the adapter's explicitly declared deliverables. */
export const agentOutputDeliverySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('files'), paths: deliveryPathsSchema }).strict(),
  z.object({ mode: z.literal('archive'), paths: deliveryPathsSchema }).strict()
])
export type AgentOutputDelivery = z.output<typeof agentOutputDeliverySchema>
