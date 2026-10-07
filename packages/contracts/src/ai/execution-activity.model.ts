import { z } from 'zod/v3'

export const codingExecutionViewKey = 'platform.coding-execution__execution'
export const executionActivityCapabilitiesSchema = z
  .object({
    version: z.literal(1),
    presentation: z.literal('coding')
  })
  .strict()
export type ExecutionActivityCapabilities = z.infer<typeof executionActivityCapabilitiesSchema>

const text = z.string().max(65536)
const change = z
  .object({
    path: z.string().max(4096),
    change: z.enum(['created', 'modified', 'deleted', 'reported']),
    patch: text.optional()
  })
  .strict()
export const executionActivityItemSchema = z
  .object({
    id: z.string().min(1).max(512),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    content: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('message'), text }).strict(),
      z
        .object({
          kind: z.literal('tool'),
          name: z.string().max(256).optional(),
          status: z.enum(['running', 'succeeded', 'failed', 'unknown']),
          input: text.optional(),
          output: z
            .string()
            .max(2 * 1024 * 1024)
            .optional(),
          truncated: z.boolean().optional(),
          outputRef: z
            .object({ key: z.string().regex(/^[a-f0-9]{64}$/), length: z.number().int().positive() })
            .strict()
            .optional(),
          detail: z
            .discriminatedUnion('type', [
              z
                .object({
                  type: z.literal('command'),
                  command: text,
                  cwd: z.string().max(4096).optional(),
                  exitCode: z.number().int().optional(),
                  outputMode: z.literal('merged')
                })
                .strict(),
              z.object({ type: z.literal('file_change'), files: z.array(change).max(100) }).strict()
            ])
            .optional()
        })
        .strict(),
      z.object({ kind: z.literal('diagnostic'), code: z.string().max(128), text }).strict()
    ])
  })
  .strict()
export type ExecutionActivityItem = z.infer<typeof executionActivityItemSchema>
export const executionActivityBatchSchema = z
  .object({
    items: z.array(executionActivityItemSchema).max(100),
    sourceCursor: z.string().max(8192).optional(),
    expectedSourceCursor: z.string().max(8192).optional(),
    complete: z.boolean().optional(),
    gaps: z
      .array(z.enum(['source_truncated', 'storage_unavailable', 'capture_limit', 'interrupted', 'source_lost']))
      .max(5)
      .optional()
  })
  .strict()
export type ExecutionActivityBatch = z.infer<typeof executionActivityBatchSchema>
export type ExecutionActivityGap = NonNullable<ExecutionActivityBatch['gaps']>[number]
export interface ExecutionActivityCheckpoint {
  sourceCursor?: string
  seq: number
}
export interface ExecutionActivityPage {
  items: Array<ExecutionActivityItem & { seq: number; firstSeq: number; observedAt: string }>
  nextCursor: number
  hasMore: boolean
  state: 'not_recorded' | 'recording' | 'closed' | 'expired'
  gaps: ExecutionActivityGap[]
}
