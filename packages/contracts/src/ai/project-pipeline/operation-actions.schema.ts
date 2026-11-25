import { z } from 'zod/v3'

const label = z.object({ en_US: z.string().max(2000), zh_Hans: z.string().max(2000).optional() }).strict()

/** Human actions belong to the operation's owning domain, independently of pipeline decisions. */
export const projectPipelineOperationActionsSchema = z
  .object({
    operationId: z.string().uuid().nullable(),
    messages: z.array(label).max(20),
    items: z
      .array(
        z
          .object({
            key: z.string().min(1).max(100),
            version: z.string().min(1).max(128),
            title: label,
            confirmation: label
          })
          .strict()
      )
      .max(10)
  })
  .strict()
export const projectPipelineOperationActionSchema = z
  .object({
    operationId: z.string().uuid(),
    key: z.string().min(1).max(100),
    version: z.string().min(1).max(128)
  })
  .strict()
export type ProjectPipelineOperationActions = z.output<typeof projectPipelineOperationActionsSchema>
export type ProjectPipelineOperationAction = z.output<typeof projectPipelineOperationActionSchema>
