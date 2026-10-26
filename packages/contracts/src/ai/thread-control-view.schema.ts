import { z } from 'zod/v3'

/** Public presentation only. Every command revalidates permission and execution admission. */
export const threadControlActionsSchema = z
  .object({
    canPause: z.boolean(),
    canResume: z.boolean(),
    canTerminate: z.boolean(),
    canSend: z.boolean(),
    canQueue: z.boolean(),
    canRetry: z.boolean(),
    canRespond: z.boolean()
  })
  .strict()
export const threadControlViewSchema = z
  .object({
    version: z.literal(1),
    threadId: z.string().min(1),
    runId: z.string().min(1).nullable(),
    revision: z.string().regex(/^[1-9][0-9]*$/),
    state: z.enum([
      'idle',
      'running',
      'pausing',
      'paused',
      'stopping',
      'settling',
      'input_required',
      'confirming',
      'completed',
      'stopped',
      'failed'
    ]),
    actions: threadControlActionsSchema,
    pauseId: z.string().optional()
  })
  .strict()
export type ThreadControlView = Omit<Required<z.output<typeof threadControlViewSchema>>, 'actions' | 'pauseId'> & {
  actions: ThreadControlActions
  pauseId?: string
}
export type ThreadControlActions = Required<z.output<typeof threadControlActionsSchema>>
