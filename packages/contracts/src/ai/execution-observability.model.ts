import { z } from 'zod/v3'

export const executionObservationStatusSchema = z.enum([
  'running',
  'success',
  'error',
  'pending',
  'timeout',
  'interrupted',
  'unknown'
])
export const executionObservationFilterSchema = z
  .object({
    from: z.string().datetime({ offset: true }).describe('Inclusive UTC/offset timestamp.'),
    to: z.string().datetime({ offset: true }).describe('Exclusive timestamp, at most 31 days after from.'),
    timeZone: z
      .string()
      .max(80)
      .default('UTC')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value })
          return true
        } catch {
          return false
        }
      }, 'Use an IANA time zone'),
    countingUnit: z.enum(['root_execution', 'assistant_invocation']).default('root_execution'),
    assistantId: z.string().uuid().optional(),
    conversationId: z
      .string()
      .uuid()
      .optional()
      .describe('Exact persisted conversation ID; includes all matching threads.'),
    threadId: z.string().min(1).max(100).optional().describe('Exact persisted thread ID.'),
    unknownAssistantOnly: z.boolean().optional().describe('Only records with no persisted Assistant identity.'),
    workspaceId: z.string().uuid().optional(),
    recordedById: z
      .string()
      .uuid()
      .optional()
      .describe('Record creator, not necessarily the end user or billed actor.'),
    source: z.string().trim().min(1).max(80).optional(),
    statuses: z.array(executionObservationStatusSchema).max(7).optional(),
    search: z.string().trim().max(80).optional(),
    asOf: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('Interval clipping boundary; this does not freeze mutable database records.')
  })
  .strict()

export const executionObservationQuerySchema = executionObservationFilterSchema
  .extend({
    page: z.number().int().min(1).max(10000).default(1),
    pageSize: z.number().int().min(1).max(100).default(25)
  })
  .strict()
  .superRefine((input, context) => {
    const duration = Date.parse(input.to) - Date.parse(input.from)
    if (duration <= 0 || duration > 31 * 86400000)
      context.addIssue({ code: 'custom', path: ['to'], message: 'Choose a positive range of at most 31 days.' })
  })
export type ExecutionObservationQuery = z.output<typeof executionObservationQuerySchema>
export type ExecutionObservationQueryInput = z.input<typeof executionObservationQuerySchema>

export const executionObservationRecordSchema = z.object({
  id: z.string(),
  assistantId: z.string().nullable(),
  assistantName: z.string().nullable(),
  workspaceId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  conversationId: z.string().nullable(),
  threadId: z.string().nullable(),
  parentId: z.string().nullable(),
  parentThreadId: z.string().nullable(),
  forkedFromMessageId: z.string().nullable(),
  title: z.string().nullable(),
  source: z.string().nullable(),
  recordedById: z.string().nullable(),
  status: executionObservationStatusSchema,
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  elapsedTimeMs: z.number().nullable(),
  invocationKind: z.enum(['external_assistant', 'sub_agent']).nullable(),
  endKnown: z.boolean(),
  hasError: z.boolean(),
  timingBasis: z.literal('record_lifecycle'),
  phasesAvailable: z.literal(false)
})
export type ExecutionObservationRecord = z.infer<typeof executionObservationRecordSchema>
export const executionObservationSegmentSchema = z.object({
  start: z.string(),
  end: z.string(),
  count: z.number().int().positive()
})
export type ExecutionObservationSegment = z.infer<typeof executionObservationSegmentSchema>
export const executionObservationSummarySchema = z.object({
  total: z.number(),
  assistants: z.number(),
  conversations: z.number(),
  statuses: z.object({
    running: z.number(),
    success: z.number(),
    error: z.number(),
    pending: z.number(),
    timeout: z.number(),
    interrupted: z.number(),
    unknown: z.number()
  }),
  successRate: z.number().nullable(),
  p50ElapsedMs: z.number().nullable(),
  p95ElapsedMs: z.number().nullable(),
  durationSamples: z.number(),
  peakOverlap: z.number(),
  overlap: z.array(executionObservationSegmentSchema),
  knownIntervals: z.number(),
  unknownEnds: z.number(),
  timingBasis: z.literal('record_lifecycle'),
  phaseCoverage: z.literal('unavailable'),
  observedAt: z.string(),
  asOf: z.string(),
  usage: z.object({
    records: z.number(),
    totalTokens: z.number().nullable(),
    unpricedRecords: z.number(),
    currencies: z.array(z.object({ currency: z.string(), amount: z.number() })),
    basis: z.literal('direct_execution_ledger'),
    coveredExecutions: z.number()
  })
})
export type ExecutionObservationSummary = z.infer<typeof executionObservationSummarySchema>
/** Static avatar projection; animated appearance assets are unnecessary in dense rows. */
export const executionObservationAvatarSchema = z.object({
  url: z.string().optional(),
  background: z.string().optional(),
  emoji: z.object({ id: z.string(), unified: z.string().optional() }).optional()
})
export const executionObservationAssistantSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  workspaceId: z.string().nullable(),
  workspaceName: z.string().nullable(),
  avatar: executionObservationAvatarSchema.nullable(),
  total: z.number(),
  running: z.number(),
  pending: z.number(),
  interrupted: z.number(),
  failed: z.number(),
  failures: z.array(z.object({ id: z.string(), completedAt: z.string() })).max(50),
  failureMarkersTruncated: z.boolean(),
  overlap: z.array(executionObservationSegmentSchema)
})
export const executionObservationOverviewSchema = z.object({
  query: executionObservationQuerySchema,
  summary: executionObservationSummarySchema.omit({ usage: true }),
  assistants: z.array(executionObservationAssistantSchema),
  totalAssistants: z.number(),
  page: z.number(),
  pageSize: z.number()
})
export type ExecutionObservationOverview = z.infer<typeof executionObservationOverviewSchema>
export const executionObservationListSchema = z.object({
  items: z.array(executionObservationRecordSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  asOf: z.string(),
  observedAt: z.string()
})
export type ExecutionObservationList = z.infer<typeof executionObservationListSchema>
export const executionObservationWorkspacesSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
  hasMore: z.boolean()
})
export const executionObservationDetailSchema = z.object({
  item: executionObservationRecordSchema,
  children: z.array(executionObservationRecordSchema),
  childTotal: z.number(),
  childPage: z.number(),
  usage: executionObservationSummarySchema.shape.usage,
  observedAt: z.string()
})
export type ExecutionObservationDetail = z.infer<typeof executionObservationDetailSchema>
export const executionObservationDetailQuerySchema = z
  .object({
    executionId: z.string().uuid(),
    childPage: z.number().int().min(1).max(10000).default(1)
  })
  .strict()
export const executionObservationCompareSchema = z
  .object({
    current: executionObservationQuerySchema,
    baseline: executionObservationQuerySchema
  })
  .strict()
export const executionObservationAnomalySchema = z
  .object({
    query: executionObservationQuerySchema,
    rule: z.enum(['failed', 'long_running', 'slow_completed']).default('failed'),
    thresholdMs: z
      .number()
      .int()
      .min(1000)
      .max(31 * 86400000)
      .default(300000),
    limit: z.number().int().min(1).max(100).default(20)
  })
  .strict()
export type ExecutionObservationComparison = {
  current: ExecutionObservationSummary
  baseline: ExecutionObservationSummary
  currentPerHour: number
  baselinePerHour: number
  countDelta: number
  successRateDelta: number | null
}
export type ExecutionObservationAnomalies = {
  rule: z.infer<typeof executionObservationAnomalySchema>['rule']
  thresholdMs: number
  items: ExecutionObservationRecord[]
  total: number
  asOf: string
  observedAt: string
}

/** Complete conversation groups, paginated after aggregation so a group is never split. */
export const executionObservationConversationSchema = z.object({
  key: z.string(),
  conversationId: z.string().nullable(),
  threadId: z.string().nullable(),
  executionId: z.string().nullable(),
  total: z.number(),
  threads: z.number(),
  branches: z.number(),
  childExecutions: z.number(),
  failed: z.number(),
  unknownEnds: z.number(),
  overlap: z.array(executionObservationSegmentSchema),
  failures: z.array(z.object({ id: z.string(), completedAt: z.string() })).max(50)
})
export type ExecutionObservationConversation = z.infer<typeof executionObservationConversationSchema>
export const executionObservationConversationsSchema = z.object({
  items: z.array(executionObservationConversationSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  asOf: z.string(),
  observedAt: z.string()
})
export type ExecutionObservationConversations = z.infer<typeof executionObservationConversationsSchema>
