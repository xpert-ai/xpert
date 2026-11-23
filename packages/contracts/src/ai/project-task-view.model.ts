import { z } from 'zod'

const page = { after: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).default(50) }
const version = { contractVersion: z.literal(2), knownVersion: z.string().max(256).optional() }
/** Resource names determine the projection; clients cannot request arbitrary entity fields. */
export const projectTaskViewQuerySchema = z.discriminatedUnion('resource', [
  z.object({ ...version, resource: z.literal('context') }).strict(),
  z
    .object({
      ...version,
      resource: z.literal('task-index'),
      compactAvatars: z.boolean().optional(),
      avatarVersions: z
        .array(z.string().regex(/^[a-f0-9]{64}$/))
        .max(128)
        .default([])
    })
    .strict(),
  z
    .object({
      ...version,
      resource: z.literal('executions'),
      taskIds: z.array(z.string().uuid()).min(1).max(100),
      ...page
    })
    .strict(),
  z.object({ ...version, resource: z.literal('task-detail'), taskId: z.string().uuid() }).strict(),
  z
    .object({
      ...version,
      resource: z.literal('execution-detail'),
      taskId: z.string().uuid(),
      executionId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      ...version,
      resource: z.literal('execution-artifacts'),
      taskId: z.string().uuid(),
      executionId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      ...version,
      resource: z.literal('execution-result'),
      taskId: z.string().uuid(),
      executionId: z.string().uuid(),
      expectedRevision: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(12000).default(12000)
    })
    .strict()
])
export type ProjectTaskViewQuery = z.output<typeof projectTaskViewQuerySchema>
